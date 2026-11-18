"""OpenAI-үйлесімді провайдер адаптерінің тесттері (желіге шықпайды: SDK клиентінің орнына stub)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

import httpx
import openai

from app.llm_gateway import Message
from app.llm_gateway.providers.base import CompletionRequest, ProviderError
from app.llm_gateway.providers.openai_compat import OpenAICompatProvider, _batch_row, to_provider_error

REQUEST = CompletionRequest(
    model="m",
    messages=(Message("system", "s"), Message("user", "u")),
    temperature=0,
    max_output_tokens=50,
    timeout_s=5,
)


def _response(status: int, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, request=httpx.Request("POST", "https://example.invalid/v1"), headers=headers)


class _Completions:
    def __init__(self, result=None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.kwargs: dict | None = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error is not None:
            raise self.error
        return self.result


def _client(completions: _Completions) -> SimpleNamespace:
    return SimpleNamespace(chat=SimpleNamespace(completions=completions))


class _AsyncChunks:
    def __init__(self, chunks) -> None:
        self._chunks = list(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._chunks:
            raise StopAsyncIteration
        return self._chunks.pop(0)


class BodyTests(unittest.TestCase):
    def test_json_schema_body(self) -> None:
        provider = OpenAICompatProvider("p", api_key="test", client=_client(_Completions()))
        request = CompletionRequest(**{**REQUEST.__dict__, "json_schema": {"type": "object"}, "schema_name": "Grade"})
        body = provider.body(request)
        self.assertEqual(body["max_completion_tokens"], 50)
        self.assertEqual(body["response_format"]["type"], "json_schema")
        self.assertEqual(body["response_format"]["json_schema"]["name"], "Grade")
        self.assertNotIn("stream", body)

    def test_json_object_and_max_tokens_variant(self) -> None:
        provider = OpenAICompatProvider(
            "p", api_key="test", structured_outputs="json_object", max_tokens_param="max_tokens",
            client=_client(_Completions()),
        )
        request = CompletionRequest(**{**REQUEST.__dict__, "json_schema": {"type": "object"}})
        body = provider.body(request, stream=True)
        self.assertEqual(body["max_tokens"], 50)
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertEqual(body["stream_options"], {"include_usage": True})


class ErrorMappingTests(unittest.TestCase):
    def test_rate_limit_is_retryable_with_retry_after(self) -> None:
        exc = openai.RateLimitError("limit", response=_response(429, {"retry-after": "3"}), body=None)
        error = to_provider_error(exc)
        self.assertTrue(error.retryable)
        self.assertEqual(error.retry_after, 3.0)
        self.assertEqual(error.status, 429)

    def test_bad_request_is_not_retryable(self) -> None:
        exc = openai.BadRequestError("bad", response=_response(400), body=None)
        self.assertFalse(to_provider_error(exc).retryable)

    def test_timeout_is_retryable(self) -> None:
        exc = openai.APITimeoutError(request=httpx.Request("POST", "https://example.invalid/v1"))
        self.assertTrue(to_provider_error(exc).retryable)

    def test_error_message_does_not_copy_sdk_text(self) -> None:
        exc = openai.BadRequestError("оқушы жауабы: құпия", response=_response(400), body=None)
        self.assertNotIn("құпия", str(to_provider_error(exc)))


class CallTests(unittest.IsolatedAsyncioTestCase):
    async def test_complete_maps_usage_and_model(self) -> None:
        result = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="жауап"))],
            usage=SimpleNamespace(prompt_tokens=12, completion_tokens=3, prompt_tokens_details=SimpleNamespace(cached_tokens=8)),
            model="m-2026-01-01",
        )
        completions = _Completions(result=result)
        provider = OpenAICompatProvider("p", api_key="test", client=_client(completions))
        completion = await provider.complete(REQUEST)
        self.assertEqual(completion.text, "жауап")
        self.assertEqual(completion.model, "m-2026-01-01")
        self.assertEqual((completion.usage.input_tokens, completion.usage.cached_tokens, completion.usage.output_tokens), (12, 8, 3))
        self.assertEqual(completions.kwargs["timeout"], 5)

    async def test_complete_wraps_sdk_errors(self) -> None:
        exc = openai.InternalServerError("down", response=_response(503), body=None)
        provider = OpenAICompatProvider("p", api_key="test", client=_client(_Completions(error=exc)))
        with self.assertRaises(ProviderError) as ctx:
            await provider.complete(REQUEST)
        self.assertTrue(ctx.exception.retryable)

    async def test_stream_yields_text_and_final_usage(self) -> None:
        def chunk(text, usage=None):
            choices = [SimpleNamespace(delta=SimpleNamespace(content=text))] if text is not None else []
            return SimpleNamespace(choices=choices, usage=usage, model="m")

        usage = SimpleNamespace(prompt_tokens=4, completion_tokens=2, prompt_tokens_details=None)
        completions = _Completions(result=_AsyncChunks([chunk("Сә"), chunk("лем"), chunk(None, usage)]))
        provider = OpenAICompatProvider("p", api_key="test", client=_client(completions))
        chunks = [c async for c in provider.stream(REQUEST)]
        self.assertEqual("".join(c.text for c in chunks), "Сәлем")
        self.assertEqual(chunks[-1].usage.output_tokens, 2)
        self.assertTrue(completions.kwargs["stream"])


class BatchRowTests(unittest.TestCase):
    def test_success_row(self) -> None:
        row = {
            "custom_id": "q1",
            "response": {
                "status_code": 200,
                "body": {
                    "choices": [{"message": {"content": '{"score": 4}'}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 2, "prompt_tokens_details": {"cached_tokens": 4}},
                },
            },
        }
        result = _batch_row(row)
        self.assertEqual(result.text, '{"score": 4}')
        self.assertEqual(result.usage.cached_tokens, 4)
        self.assertIsNone(result.error)

    def test_error_row(self) -> None:
        result = _batch_row({"custom_id": "q2", "response": {"status_code": 500, "body": {}}, "error": None})
        self.assertIsNone(result.text)
        self.assertEqual(result.error, "HTTP 500")


if __name__ == "__main__":
    unittest.main()
