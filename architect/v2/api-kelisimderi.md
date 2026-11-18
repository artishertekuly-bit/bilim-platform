# API келісімдері v2

> **Күні:** 2026-11-18 · **Жаңа құжат**
> **Статусы:** бекітілді (D34–D41, 2026-11-18). Келісім жазу кезінде қабылданған шешімдер — §9.
> **Белгілер:** ✅ бекітілген
> **Байланысты құжаттар:** [ai_examiner.md](ai_examiner.md) · [bagalau-zhuiesi.md](bagalau-zhuiesi.md) · [lightrag_personarag.md](lightrag_personarag.md) · [ortaq-infraqurylym.md](ortaq-infraqurylym.md) · [platforma-kartasy.md](platforma-kartasy.md)
> **Прототип:** [Bilim — телефон прототипі](https://claude.ai/artifact/3tQFU9F55nrtjoqhTGM6H2)

Бұл құжат клиент (React + Capacitor) пен сервистер арасындағы келісімді анықтайды: қандай эндпоинт бар, оны кім шақыра алады, не жіберіледі және не қайтарылады. Бағалау мен диалог логикасы мұнда қайталанбайды, тек сілтеме беріледі.

---

## 1. Шекаралар

| Шекара | Іске асыру | Префикс | Деректер |
|---|---|---|---|
| Examiner | FastAPI сервисі, `examiner_svc` рөлі | `/api/examiner/v1` | `examiner` схемасы; `rag` — тек оқу |
| Tutor | FastAPI сервисі, `tutor_svc` рөлі | `/api/tutor/v1` | `tutor` схемасы; `rag` — тек оқу |
| Ойындар | FastAPI сервисі, `games_svc` рөлі ([geimifikatsiya §7](geimifikatsiya.md)) | `/api/games/v1` | `games` схемасы; `rag` — тек оқу |
| Платформа | Supabase: кестелер RLS-пен, күрделі әрекеттер RPC арқылы | `/rest/v1`, `/rest/v1/rpc` | `public` схемасы |

- `examiner` пен `tutor` схемалары Supabase API-ына ашылмайды (D15). Сондықтан мұғалім панелі мен ата-ана беті емтихан нәтижесін Examiner API арқылы алады, ал Tutor-ға «бұғатты ашу» командасын Tutor API арқылы жібереді ([karta §4.1](platforma-kartasy.md)).
- Платформа бөлігінде LLM де, құпия кілт те жоқ, сондықтан оған бөлек сервис жасалмайды. Сабақтар, бетбелгілер, жазбалар, чат және сыныптар Supabase RLS ережелерімен қорғалады; қазіргі фронтенд те осылай жұмыс істейді.
- LLM gateway HTTP API емес: ол сервистердің ішіндегі кітапхана (§7).
- Ойын сервисінің эндпоинттері осы құжаттың жалпы ережелеріне (§2) бағынады; олардың тізімі ойын сервисін іске асыру кезінде жазылады.
- Қазіргі `/api/ai/*` эндпоинттері ([main.py](../../backend/app/main.py)) жаңа API іске қосылғанда алынады.

---

## 2. Жалпы ережелер

### 2.1. Аутентификация және рұқсат
- Әр сұраныста `Authorization: Bearer <Supabase JWT>` болады. Рөл `user_roles` кестесінен алынады ([auth.py](../../backend/app/dependencies/auth.py)).
- Рұқсат рөлмен ғана емес, байланыспен де тексеріледі:

| Кім | Кімнің дерегін көреді |
|---|---|
| Оқушы | Тек өзінікін |
| Мұғалім | Өз сыныптарындағы оқушылардың дерегін (`class_members`, D25), тек сыныптың пәні бойынша (D38) |
| Ата-ана | Байланысы расталған баласының дерегін (`parent_student_links`, D27) |
| Әкімші | Пайдаланушылар, рөлдер, пәндер, сабақ модерациясы. Оқушы нәтижесін көрсететін эндпоинттерге әкімші кірмейді ([ortaq §9](ortaq-infraqurylym.md)) |

- Байланысы жоқ оқушы туралы сұраныс `404` қайтарады, сондықтан бөтен оқушының бар-жоғы ашылмайды.

### 2.2. Формат
- JSON, UTF-8. Өріс атаулары `snake_case` түрінде. Идентификаторлар — `uuid`, уақыт — ISO 8601, UTC.
- Пайдаланушыға көрінетін мәтіндер (хабарламалар, қате түсіндірмелері) қазақ тілінде.
- DTO-лардың жалғыз көзі — сервистегі Pydantic модельдері. Олардан OpenAPI шығады, ал фронтендтегі TypeScript типтері OpenAPI-дан генерацияланады (§8). Төмендегі типтер оқуға ыңғайлы болуы үшін TypeScript түрінде жазылған.
- Нұсқа жолда көрсетіледі: `/v1`. Үйлесімсіз өзгеріс жаңа нұсқаға шығады.

### 2.3. Қайталанған сұраныс
Телефонда байланыс жиі үзіледі. Сондықтан күй өзгертетін әр сұраныста клиент жасаған `client_request_id` (uuid) болады. Сол id-мен қайта келген сұранысқа сервер бірінші жауабын қайталайды; id сол, бірақ мазмұны басқа болса — `409 DUPLICATE_REQUEST`.

### 2.4. Қателер

```json
{ "error": { "code": "SESSION_BLOCKED", "message": "Сессия уақытша тоқтатылды. Мұғаліміңізге хабарласыңыз.", "details": {} } }
```

| HTTP | `code` | Қашан |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Өріс жоқ немесе шектен асқан (Т6 шектері, мәтін ұзындығы) |
| 401 | `UNAUTHENTICATED` | Токен жоқ немесе мерзімі өткен |
| 403 | `FORBIDDEN` | Рөл сәйкес емес |
| 404 | `NOT_FOUND` | Ресурс жоқ немесе байланыс жоқ (§2.1) |
| 409 | `ACTIVE_SESSION_EXISTS` | Оқушының аяқталмаған сессиясы бар (D36); `details.session_id` |
| 409 | `ALREADY_ANSWERED`, `DUPLICATE_REQUEST` | Тапсырмаға жауап берілген; id қайталанды, бірақ мазмұны басқа |
| 410 | `SESSION_CLOSED` | Сессия аяқталған немесе тасталған |
| 422 | `ANSWER_FILTERED` | Жауап кіріс сүзгісінен өтпеді: тек эмодзи, мағынасыз әріптер, сұрақты көшіру ([examiner §7.1](ai_examiner.md)). Бұл страйк емес |
| 423 | `SESSION_BLOCKED`, `TUTOR_BLOCKED` | Емтихан сессиясы ([examiner §7.2](ai_examiner.md)) немесе Tutor диалогы ([personarag §6.3](lightrag_personarag.md)) бұғатталған; `details.blocked_until` |
| 429 | `RATE_LIMITED` | Лимит асты; `Retry-After` тақырыбы бар |

- Ресми бағалаудың провайдері істен шықса, клиентке қате қайтарылмайды: жауап қабылданады, ал бағасы `pending` күйінде кезекте күтеді ([ortaq §2.4](ortaq-infraqurylym.md)).
- `A` блогында уақыт біткен соң келген жауап қате емес: ол қабылданады, `late = true` және `s = 0` ([bagalau §4.2](bagalau-zhuiesi.md)).

### 2.5. Ағын (SSE)
- Диалог жауаптары `text/event-stream` арқылы келеді. Сұраныс `POST` болғандықтан, клиент `EventSource`-ты емес, `fetch` ағынын оқиды.
- Оқиғалар: `token` (мәтін бөлігі), `done` (қорытынды), `error`; Tutor-да қосымша `blocked` бар.
- Байланыс үзілсе де, сервер жауапты аяғына дейін жазып сақтайды. Клиент сол `client_request_id`-мен қайта жіберсе, сервер қайта генерацияламай, дайын мәтінді бірден қайтарады.

### 2.6. Лимиттер
Мәндер — конфигурациядағы бастапқы мәндер.

| Әрекет | Лимит |
|---|---|
| Tutor хабарламасы | Минутына 6; бір хабарлама ≤ 2000 таңба |
| Емтихандағы мәтін жауабы | ≤ 2000 таңба; Кейс пен Фейнман ≤ 3000 таңба |
| Сынып кодын тексеру | Сағатына 10 әрекет (§5.2) |

---

## 3. Examiner API

### 3.1. Сессияның өмірі

```
preparing → active → completed
                   ↘ blocked     (2-ші бұзушылық, examiner §7.2)
                   ↘ abandoned   (оқушы шықты немесе белсенділік жоқ, D36)
```

- `preparing` — банкте сұрақ жетпей, Е3 бойынша генерация жүріп жатыр ([examiner §5.4](ai_examiner.md)). Клиент `GET /sessions/{session_id}` сұранысын `Retry-After` бойынша қайталайды.
- Сессия басталғанда `X.1` пен `X.2` тапсырмаларының бәрі бір транзакцияда бекітіледі (Е1, `FOR UPDATE SKIP LOCKED`). `X.3` оның шарты орындалғанда бекітіледі.
- Құрам мен рет — [bagalau §2.3](bagalau-zhuiesi.md). Клиент ретті өзгерте алмайды.
- Соңғы тапсырмаға жауап берілгенде сессия өзі аяқталады; бөлек «аяқтау» сұранысы жоқ.

### 3.2. Эндпоинттер: оқушы

| Әдіс | Жол | Мақсаты | Экран |
|---|---|---|---|
| GET | `/scopes?subject_id=` | Пәннің тараулары мен §-тері (`chunk_meta`-дан) | Деңгей таңдау: «Тақырып / Тарау / Пән» |
| GET | `/levels?scope_type=&scope_id=` | Төрт деңгей картасы және осы масштабтағы соңғы нәтиже | Деңгей таңдау |
| POST | `/sessions` | Сессия бастау: `{ client_request_id, scope_type, scope_id, level }` | — |
| GET | `/sessions/active` | Аяқталмаған сессия (қосымша қайта ашылғанда) | — |
| GET | `/sessions/{session_id}` | Сессия күйі және ағымдағы тапсырма | Сессия |
| POST | `/sessions/{session_id}/items/{item_id}/answer` | Жауап және 1-саты нәтижесі | Барлық формат |
| GET | `/sessions/{session_id}/items/{item_id}/explanation` | 2-сатының түсіндірмесі | Сессия |
| POST | `/sessions/{session_id}/items/{item_id}/turns` | Диалог қадамы (SSE) | Сократ, «ЖИ-ді оқыт» |
| POST | `/sessions/{session_id}/abandon` | Сессиядан шығу (D36) | Сессия |
| GET | `/sessions/{session_id}/result` | Нәтиже | Сессия нәтижесі |
| GET | `/me/profile` | Пәндер бойынша `P1…P4` және `F` | Профиль |

### 3.3. DTO: сессия және тапсырма

```ts
type Level = 1 | 2 | 3 | 4;
type Tier = "X1" | "X2" | "X3";
type Format =
  | "mcq"              // 8
  | "matching"         // I-1
  | "short_answer"     // 7
  | "sequence"         // 6
  | "true_false_fix"   // 5
  | "error_step"       // I-2 (Ә)
  | "formula_builder"  // I-3 (Б)
  | "slider"           // I-4 (Г)
  | "socratic"         // 3
  | "feynman"          // 2
  | "teach_ai"         // «ЖИ-ді оқыт»
  | "priority"         // 4
  | "case_study";      // 1

interface Scope { type: "topic" | "chapter" | "subject"; id: string; title: string }

interface ExamSession {
  session_id: string;
  status: "preparing" | "active" | "completed" | "blocked" | "abandoned";
  level: Level;
  scope: Scope;
  progress: { answered: number; total: number };  // total = n; X.3 берілсе +1
  current: SessionItem | null;
  upcoming: SessionItem[];                        // prefetch, ең көбі 2 (examiner §6)
  strike_count: 0 | 1 | 2;
  started_at: string;
}

interface SessionItem {
  item_id: string;              // тек осы сессияның ішінде; question_id клиентке берілмейді
  position: number;
  tier: Tier;
  block: "A" | "D" | null;      // тек 3-деңгейде
  format: Format;
  content: ItemContent;         // public бөлік (§3.4, bagalau §3.2)
  served_at: string | null;     // берілу сәті, серверде жазылады
  deadline_at: string | null;   // тек A блогында
  state: "open" | "answered" | "grading" | "graded";
}
```

- `question_id` оқушыға берілмейді, әйтпесе оқушылар «id → жауап» тізімін жинап, бір-біріне бере алар еді. Мұғалім API-ында ол көрінеді.
- `A` блогының тапсырмалары `upcoming`-ке кірмейді. Олардың мазмұны тапсырма `current` болғанда ғана беріледі, ал `served_at` дәл сол сәтте жазылады. Әйтпесе prefetch сұрақты таймер басталмай тұрып оқуға мүмкіндік берер еді.

### 3.4. DTO: форматтар

`content` пен `answer` — `format` бойынша бөлінетін типтер. Шектер — [bagalau Т6](bagalau-zhuiesi.md).

| Формат | `content` | `answer` |
|---|---|---|
| `mcq` | `stem`, `options[{id, text}]` | `{ option_id }` |
| `matching` | `stem`, `left[{id, text}]`, `right[{id, text}]` (≤ 5 жұп) | `{ pairs[{left_id, right_id}] }` |
| `short_answer` | `stem`, `max_chars` | `{ text }` |
| `sequence` | `stem`, `steps[{id, text}]` (араластырылған, ≤ 6) | `{ order: id[] }` |
| `true_false_fix` | `statement` | `{ verdict: boolean, correction?: string }`; `verdict = false` болса, `correction` міндетті |
| `error_step` | `stem`, `steps[{id, text}]` | `{ step_id }` |
| `formula_builder` | `stem`, `slots[{id, position}]`, `tokens[{id, label}]` (≤ 6) | `{ placement: Record<slot_id, token_id> }` |
| `slider` | `stem`, `input{name, unit, min, max, step}`, `output{name, unit, formula}` | `{ value: number }` |
| `priority` | `stem`, `options[{id, text}]` | `{ ranking: id[], justification: string }` |
| `case_study` | `situation`, `data{columns, rows}` (≤ 6 жол), `task` | `{ text }` |
| `feynman` | `prompt`, `min_words` | `{ text }` |
| `socratic` | `situation`, `task`, `max_turns` | Диалог (§3.6) |
| `teach_ai` | `topic`, `opening` | Диалог (§3.6) |

- Дұрыс жұптар, қадамдардың реті, слайдердің рұқсат етілген интервалы және басымдықтың қабылданған реттері `private` бөлікте қалады. `output.formula` тек экранда көрсету үшін беріледі (мысалы, `I = 12 / R`).

### 3.5. Жауап және 1-саты

`POST /sessions/{session_id}/items/{item_id}/answer`

```ts
interface AnswerRequest { client_request_id: string; answer: Answer }

interface AnswerResult {
  item_id: string;
  check: "correct" | "incorrect" | "pending";  // код — бірден c; тек ЖИ бағалайтын тапсырма — pending
  late: boolean;                               // A блогы: уақыттан кейін келді, s = 0
  explanation: "pending" | "none";             // 2-саты дайындалып жатыр ма
  moderation: { strike_count: 1 | 2; message: string; retry_allowed: boolean } | null;
  session: ExamSession;                        // жаңарған күй: current, upcoming
}
```

- Гибридте (`true_false_fix`, `priority`) `check` код бөлігінің нәтижесін (`c`) көрсетеді; түсіндірме бөлігі (`a`) кейін бағаланады.
- Сессия ішінде оқушыға тапсырманың балы `s` емес, тек `check` көрсетіледі. Балдар нәтиже экранында шығады.
- **1-ші бұзушылық:** `moderation.retry_allowed = true`, тапсырма `open` күйіне қайтады (екінші мүмкіндік). **2-ші бұзушылық:** тапсырмаға `s = 0` қойылып, `session.status = "blocked"` болады; келесі сұраныстар `423 SESSION_BLOCKED` қайтарады ([examiner §7.2](ai_examiner.md)).
- Соңғы `X.2` тапсырмасынан кейін `X.3` шарты тексеріледі. ЖИ бағасы әлі дайын болмаса, `session.current = null` болады, ал клиент `GET /sessions/{session_id}` сұранысын `Retry-After` бойынша қайталайды. Шарт алдын ала ЖИ бағасымен тексеріледі (D37).

### 3.6. 2-саты және диалог

**Түсіндірме** — `GET /sessions/{session_id}/items/{item_id}/explanation`:
- `202 { "status": "pending" }` және `Retry-After: 1` — түсіндірме әлі дайын емес (мақсат: p95 < 5 сек, [ortaq §2.6](ortaq-infraqurylym.md));
- `200 { "status": "ready", "text": "…" }`.

**Диалог** — `POST /sessions/{session_id}/items/{item_id}/turns`, жауап SSE арқылы келеді:

```ts
interface TurnRequest { client_request_id: string; text: string }
```

```
event: token   data: {"text": "Жақсы. Ал кедергіні екі есе азайтсақ..."}
event: done    data: {"turn_no": 2, "turns_left": 1, "dialog_complete": false}
event: error   data: {"code": "ANSWER_FILTERED", "message": "…"}
```

- Оқушының бірінші хабарламасы — жағдаяттық тапсырманың жауабы. Тексеру нүктелерінің сұрақтарын ЖИ қояды, бірақ олардың санын (ең көбі 3) бэкенд санайды ([bagalau Т3](bagalau-zhuiesi.md)).
- `dialog_complete = true` болғанда тапсырма `grading` күйіне өтеді. Диалог біткенде бір рет, тұтас бағаланады (Т3).
- Диалогтағы хабарламалар да кіріс сүзгісі мен модерациядан өтеді, страйк ережесі §3.5-тегідей.

### 3.7. Нәтиже

```ts
interface SessionResult {
  session_id: string;
  level: Level;
  scope: Scope;
  p: number;                 // 0–100, bagalau §4.2
  threshold: 80 | 85 | 75;
  mastered: boolean;
  is_final: boolean;         // ЖИ бағасы мұғалім растауын күтсе — false (D16)
  breakdown: { format: Format; block: "A" | "D" | null; tasks: number; score: number; max: number }[];
  total: { score: number; max: number };
  x3: { status: "not_eligible" | "passed" | "failed"; reason?: string };
  subject_profile: SubjectProfile;
}
```

- 3-деңгейде `breakdown` `A` және `D` блоктары бойынша бөлінеді, ал `p = (0.7·D + 0.3·A) × 100`.

### 3.8. Профиль

```ts
interface LevelResult {
  level: Level;
  p: number | null;          // null — оқушы бұл деңгейден өтпеді
  mastered: boolean;
  is_final: boolean;
  taken_at: string | null;
}

interface SubjectProfile {
  subject: { id: string; title: string; grade: number };
  levels: [LevelResult, LevelResult, LevelResult, LevelResult];
  f: number | null;          // тек төрт деңгей түгел тапсырылғанда (bagalau §4.3)
}

interface StudentProfile { subjects: SubjectProfile[] }
```

- Оқушы өтпеген деңгей `p = null` болып келеді, ал клиент оны «өтпеді» деп көрсетеді. «Өтпеді» мағынасында `0` ешқашан жіберілмейді ([bagalau §4.3](bagalau-zhuiesi.md)).
- Профиль мен `F` тек пән масштабындағы емтиханнан құрылады (D35). Тақырып пен тараудың нәтижесі `GET /levels` арқылы сол масштабта көрінеді.

### 3.9. Эндпоинттер: мұғалім

| Әдіс | Жол | Мақсаты | Экран |
|---|---|---|---|
| GET | `/teacher/classes/{class_id}/profiles` | Сынып оқушыларының сыныптың пәні бойынша `P1…P4` кестесі (D38) | Сынып · профильдер |
| GET | `/teacher/classes/{class_id}/rating` | `F` бойынша рейтинг, тек толық профилі барлар (D23); `full_count`, `total` | Сынып · рейтинг |
| GET | `/teacher/review-queue?class_id=` | Растауды күтетін ЖИ бағалары (D16) және дәйексөзі табылмаған жауаптар (Т9) | Растау |
| GET | `/teacher/grades/{grade_id}` | Тапсырма, рубрика, оқушының жауабы, ЖИ балы, дәйексөздер | Бағаны растау |
| POST | `/teacher/grades/{grade_id}/confirm` | ЖИ бағасын растау | Бағаны растау |
| POST | `/teacher/grades/{grade_id}/override` | `{ client_request_id, new_score, reason }`: `new_score` — тапсырманың `s` балы (0–4), себеп міндетті → `grade_overrides` (Т11) | Бағаны растау |
| POST | `/teacher/alerts/{alert_id}/false-positive` | Қате дабыл: страйк жойылады, балл `grade_overrides` арқылы қалпына келеді ([examiner §7.2](ai_examiner.md)) | Панель |

```ts
interface ReviewItem {
  grade_id: string;
  student: { id: string; name: string };
  question_id: string;
  format: Format;
  content: ItemContent;
  rubric: { score: number; descriptor: string }[];   // мұғалімге private бөлік көрінеді
  answer_text: string;
  ai_score: number;
  evidence_quotes: { text: string; start: number; end: number }[];  // жауаптағы орны, белгілеу үшін
  reason: "d16_confirmation" | "t9_missing_quote";
}
```

- Барлық ЖИ бағасы расталған немесе түзетілген соң сессияның нәтижесі `is_final = true` болады.

### 3.10. Эндпоинт: ата-ана

| Әдіс | Жол | Мақсаты |
|---|---|---|
| GET | `/parent/children/{student_id}/profile` | Баласының `StudentProfile`-і, тек оқу (D27) |

- Тек расталған `parent_student_links` бойынша беріледі. Жауаптар, диалогтар және рейтинг қайтарылмайды.

---

## 4. Tutor API

### 4.1. Эндпоинттер

| Әдіс | Жол | Мақсаты |
|---|---|---|
| GET | `/subjects` | Tutor қолдайтын пәндер (пән + сынып) |
| GET | `/conversations/current?subject_id=` | Пән бойынша ағымдағы диалог және соңғы хабарламалар; диалог жоқ болса, жасалады |
| GET | `/conversations/{conversation_id}/messages?before=&limit=` | Хабарламалар тарихы, беттеп |
| POST | `/conversations/{conversation_id}/messages` | Хабарлама жіберу; жауап SSE арқылы келеді |
| POST | `/teacher/students/{student_id}/unblock` | Мұғалім бұғатты ашады ([personarag §6.3](lightrag_personarag.md)) |

### 4.2. DTO

```ts
interface Conversation {
  conversation_id: string;
  subject: { id: string; title: string; grade: number };
  messages: TutorMessage[];        // соңғы 30
  blocked_until: string | null;    // үйде — таймердің соңы
  blocked_reason: "cooldown" | "teacher" | null;  // teacher — мұғалім ашқанша
}

interface TutorMessage { message_id: string; role: "student" | "tutor"; text: string; created_at: string }

interface SendMessageRequest { client_request_id: string; text: string }   // ≤ 2000 таңба
```

```
event: token    data: {"text": "Екеуінен де бірдей ток өтеді..."}
event: done     data: {"message_id": "…", "suggestions": ["Азырақ", "Көбірек", "Мысал келтірші"]}
event: blocked  data: {"blocked_until": "2026-11-18T10:30:00Z", "blocked_reason": "cooldown", "message": "…"}
event: error    data: {"code": "RATE_LIMITED", "message": "…"}
```

- Клиентке тек мәтін барады. Тегтер (`analytic_core`), күй, сценарий, мәнер және `M` мәндері ішкі дерек болып қалады: UI-ға олар керек емес, ал оларды көрген оқушы жүйені алдауды үйренуі мүмкін.
- `suggestions` — жауап түймелері, ең көбі 3, міндетті емес.
- Дабыл мен бұғат ережесі — [personarag §6.3](lightrag_personarag.md): сабақ үстінде диалог мұғалім ашқанша бұғатталады (`blocked_reason = "teacher"`, `blocked_until = null`), үйде — салқындау таймері біткенше (`"cooldown"`). Бұғаттан басқа жағдайда Tutor әрқашан қолжетімді (D39).

---

## 5. Платформа: Supabase кестелері және RPC

### 5.1. Сабақтар (D19–D21, D29)

| Кесте | Оқушы | Мұғалім | Әкімші |
|---|---|---|---|
| `lessons (lesson_id, author_id, title, body_md, status, published_at, updated_at)` | Жарияланғандарын оқиды | Өз сабақтарын жазады, өңдейді, жариялайды | Жасыра алады (`content_reviews`) |
| `student_lesson_bookmarks (student_id, lesson_id, created_at)` | Тек өзінікін | — | — |
| `student_lesson_notes (student_id, lesson_id, body, updated_at)` | Тек өзінікін | Көрмейді (D29) | Көрмейді |
| `lesson_attachments` | Жарияланған сабақтікін оқиды | Өз сабағына қосады | — |

- `status ∈ {draft, published, hidden}`. Жариялау шартын дерекқор тексереді: `title` ≥ 5 таңба, `body_md` ≥ 20 таңба (прототиптегі шек).
- Каталогта барлық мұғалімнің жарияланған сабақтары көрінеді. Іздеу `title` бойынша `pg_trgm` индексімен жүреді: Postgres-те қазақ тіліне арналған дайын сөз түбірін табушы жоқ, ал триграмма сөздің кез келген бөлігін табады.
- `body_md` клиентте қауіпсіз рендерленеді: HTML тазартылады.
- Қазіргі `student_lesson_notes` RLS ережелерінде мұғалімге оқу рұқсаты болса, ол алынады; бұл іске асыру кезінде тексеріледі.

### 5.2. Сыныптар (D25, D33)

Оқушы `classes` кестесін тікелей оқымайды, сондықтан кодтарды тізіп шығу мүмкін емес. Барлық әрекет `security definer` RPC арқылы өтеді, ал рөл мен байланыс RPC ішінде тексеріледі.

| RPC | Кім | Кіріс → шығыс |
|---|---|---|
| `create_class(title, subject_id)` | Мұғалім | → `{ class_id, join_code }` |
| `rotate_join_code(class_id)` | Сынып мұғалімі | → `{ join_code }`; ескі код бірден жарамсыз болады |
| `preview_class(code)` | Оқушы | → `{ class_id, title, subject, teacher_name }`; сағатына 10 әрекет |
| `join_class(code)` | Оқушы | → `{ class_id }`; қайта қосылу қате емес |
| `my_classes()` | Оқушы | → `[{ class_id, title, subject, teacher: { id, name } }]` (Профильдегі «Мұғалімдер» тізімі) |
| `remove_class_member(class_id, student_id)` | Сынып мұғалімі | → `void` |

- `join_code` — 6 таңба: бас әріп пен сан, шатасатын таңбаларсыз (`0` / `O`, `1` / `I` / `L` жоқ). Клиент енгізілген мәтінді бас әріпке айналдырады.
- QR-да тек код болады.
- Оқушы бірнеше сыныпқа қосыла алады: әр пәннің мұғалімі өз сыныбын ашады (D38). Мұғалім тек сыныбының пәні бойынша нәтижені көреді.

### 5.3. Чат (D24, D28)
- Қазіргі `chat_threads`, `chat_participants`, `chat_messages` кестелері және Supabase Realtime қалады.
- Тред тек `open_chat(other_user_id)` RPC арқылы ашылады. Ол рұқсат етілген жұпты тексереді:
  - мұғалім ↔ өз сыныбындағы оқушы;
  - мұғалім ↔ сол оқушының байланысы расталған ата-анасы.
- Хабарламаны тек тредтің қатысушысы жаза және оқи алады (RLS).
- Оқушы сыныптан шығарылса, тред тек оқу үшін қалады.

### 5.4. Дабылдар
- Мұғалім `security_alerts` кестесін RLS арқылы тікелей оқиды, тек өз сыныптарындағы оқушылардікін ([ortaq §5](ortaq-infraqurylym.md)).
- «Назар аударуды қажет ететін оқушылар» тізімі `teacher_attention_list` көрінісінен алынады: бір оқушы — бір жол, онда ашық дабылдар саны, соңғы санат пен уақыт.
- Сервистер `security_alerts`-ке тек жаза алады (ortaq §1), сондықтан дабылды мұғалім панелі `resolve_alert(alert_id, resolution)` RPC-ы арқылы жабады.
- Examiner дабылы «қате дабыл» деп белгіленсе, панель алдымен §3.9 `false-positive` командасын шақырады, ол сәтті болса — `resolve_alert`. Екі қадам да қайталауға төзімді.
- Tutor дабылында панель алдымен §4.1 `unblock` командасын шақырады (диалог бұғатталған болса), содан кейін — `resolve_alert`.

### 5.5. Бастапқы бет (D32)
- Оқушының соңғы ашқан бөлімі құрылғының өзінде сақталады (Capacitor Preferences), серверге жіберілмейді.

---

## 6. Экран → дерек көзі

| Экран | Дерек көзі |
|---|---|
| Деңгей таңдау | Examiner `GET /scopes`, `GET /levels` |
| Сессия, 12 формат | `POST /sessions`, `GET /sessions/{id}`, `POST …/answer`, `GET …/explanation` |
| `A` блогы | Сол эндпоинттер; таймер `deadline_at` бойынша |
| Сократ, «ЖИ-ді оқыт» | `POST …/turns` (SSE) |
| Сессия нәтижесі | `GET /sessions/{id}/result` |
| Тьютор | Tutor `GET /conversations/current`, `POST …/messages` |
| Сабақтар каталогы, сабақ беті | Supabase `lessons`, `student_lesson_bookmarks`, `student_lesson_notes` |
| Профиль | Examiner `GET /me/profile`; RPC `my_classes` |
| Сыныпқа қосылу | RPC `preview_class`, `join_class` |
| Мұғаліммен чат | RPC `open_chat`, Supabase Realtime |
| Мұғалім панелі | `teacher_attention_list`, Examiner `GET /teacher/review-queue`, `GET /teacher/classes/{id}/profiles` |
| Бағаны растау | `GET /teacher/grades/{id}`, `confirm`, `override` |
| Сынып · профильдер мен рейтинг | `GET …/profiles`, `GET …/rating` |
| Сабақ жазу | Supabase `lessons` |
| Ата-ана беті | Examiner `GET /parent/children/{id}/profile`; RPC `open_chat` |

---

## 7. LLM gateway интерфейсі (ішкі)

Gateway сервистердің (Examiner, Tutor, Ойындар) ішінде Python кітапханасы ретінде қолданылады ([ortaq §2](ortaq-infraqurylym.md)). Коды — [backend/app/llm_gateway](../../backend/app/llm_gateway/), конфигурациясы — [backend/config/llm_gateway.json](../../backend/config/llm_gateway.json).

```python
class Task(StrEnum):
    MODERATION = "moderation"
    TUTOR_TAGS = "tutor_tags"
    MCQ_SOLVER_CHECK = "mcq_solver_check"   # Т7
    OFFICIAL_GRADING = "official_grading"
    SECOND_GRADING = "second_grading"       # Т8
    EXPLANATION = "explanation"             # 2-саты
    TUTOR_REPLY = "tutor_reply"
    EXAMINER_DIALOG = "examiner_dialog"
    GENERATION = "generation"               # Batch API

class LLMGateway:
    async def complete(self, task: Task, prompt: PromptRef, messages: Sequence[Message], *,
                       schema: type[BaseModel] | None = None) -> LLMResult: ...
    def stream(self, task: Task, prompt: PromptRef, messages: Sequence[Message]) -> AsyncIterator[str]: ...
    async def embed(self, texts: Sequence[str], *, model_key: str,
                    priority: Priority = Priority.INTERACTIVE) -> list[list[float]]: ...
    async def submit_batch(self, task: Task, prompt: PromptRef, requests: Sequence[BatchRequest], *,
                           schema: type[BaseModel] | None = None) -> BatchHandle: ...
    async def fetch_batch(self, handle: BatchHandle) -> BatchStatus: ...

@dataclass(frozen=True)
class LLMResult:
    text: str
    parsed: BaseModel | None
    model: str                # провайдер қайтарған нақты атау (snapshot)
    provider: str
    prompt_version: str
    input_tokens: int
    cached_tokens: int
    output_tokens: int
    latency_ms: int
    cost_usd: float | None    # баға конфигурацияда жоқ болса — None
    outcome: Literal["ok", "format_error", "retried"]
    attempts: int
    fallback_used: bool
```

- Шақырушы модель атауын бермейді: тапсырма → модель картасы конфигурацияда тұрады ([ortaq §2.1](ortaq-infraqurylym.md)). Модель атаулары env айнымалыларынан алынады (`LLM_SMALL_MODEL`, `LLM_STRONG_MODEL`, `LLM_GRADING_MODEL`, …); атауы берілмеген модель тек сол тапсырма шақырылғанда қате береді.
- Конфигурация жүктелгенде архитектура ережелері тексеріледі: әр тапсырманың маршруты бар, режимі ortaq §2.1-ге сай, резерв тек Tutor мен генерацияда және басқа провайдерде, ресми бағалау моделі `pinned`, temperature 0.
- `submit_batch` `BatchHandle` қайтарады: резервке ауысса, нәтижені сол провайдерден алу керек.
- Ағында қайталау мен резерв тек бірінші токенге дейін жүреді; кейін үзілсе — `LLMStreamInterrupted`.
- Embedding: `answers` — жауап векторлары (bagalau §6). Оқулық векторларын LightRAG өз индексінің моделімен жасайды, сондықтан ол gateway маршрутына кірмейді.
- Басымдық тапсырмадан шығады: ресми бағалау > Tutor > фондық жұмыс (`SECOND_GRADING`, `GENERATION`) ([ortaq §2.3](ortaq-infraqurylym.md)).
- `OFFICIAL_GRADING` резерв провайдерге ауыспайды: провайдер істен шықса, шақыру кезекте күтеді ([ortaq §2.4](ortaq-infraqurylym.md)).
- `schema` берілсе, Structured Outputs қолданылады; формат бұзылса, сұрау конфигурациядағы рет санына дейін қайталанады, содан кейін `format_error` қайтарылады (Т5).
- `messages` реті prompt caching-ке сай: жүйелік промпт → рубрика → `reference_context` → оқушы жауабы ([ortaq §2.2](ortaq-infraqurylym.md)).
- Әр шақыру логқа жазылады ([ortaq §7](ortaq-infraqurylym.md)).

---

## 8. Келісімді тексеру

- OpenAPI сервистің Pydantic модельдерінен шығады. TypeScript типтері одан `openapi-typescript` арқылы `src/integrations/api/` ішіне генерацияланады; қолмен жазылған DTO типі болмайды.
- CI OpenAPI өзгерісін алдыңғы нұсқамен салыстырады: `/v1` ішінде үйлесімсіз өзгеріс (өрісті алу, типін өзгерту) өтпейді.
- **Кілт ағып кетпеуі:** оқушыға баратын әр DTO-да тыйым салынған өрістердің жоқтығын тест тексереді: `question_id`, `key`, `correct*`, `rubric*`, `reference_context`, `accepted_*`, `interval*`, `socratic_checkpoints` ([ortaq §4](ortaq-infraqurylym.md)).
- **Рұқсат матрицасы:** әр эндпоинт төрт рөлмен және «байланысы жоқ мұғалім / ата-ана» жағдайымен тексеріледі (§2.1).
- **Телефон желісі:** баяу желі мен үзілісті эмуляциялап, `client_request_id` арқылы қайталау тексеріледі (§2.3, §2.5).

---

## 9. Келісім жазу кезінде қабылданған шешімдер ✅

Бұл сұрақтардың жауабы бұрынғы құжаттарда жоқ еді; олар келісімді жазу кезінде табылып, бекітілді.

1. **Нәтиже масштабы (D35).** Нәтиже `(масштаб, деңгей)` бойынша сақталады. Профиль, `F` және рейтинг тек пән масштабындағы емтиханнан құрылады: тақырыптық емтихан тар материалды тексереді, сондықтан оның балын пән бойынша балмен салыстыруға болмайды. Тақырып пен тараудың нәтижесі деңгей таңдау экранында (сол масштаб таңдалғанда) және мұғалім аналитикасында көрінеді.
2. **Сессия өмірі (D36).** Оқушыда бір уақытта бір ғана белсенді сессия болады: бұл Е1 бекітулерін жеңілдетеді және екі вкладкада қатар тапсыруға жол бермейді. Оқушы «Шығу» батырмасын басса немесе 60 минут ешнәрсе істемесе, сессия `abandoned` болады және ресми `P` бермейді. Бұл оқушыға жаза емес, өйткені деңгейді қайта тапсыруға бәрібір болады; ал толық емес сессияның `P`-сын толық сессиямен салыстыруға келмейді. Сессияда берілген сұрақтар Е2 бойынша «көрілді» деп саналады.
3. **`X.3` және ЖИ бағасы (D37).** `X.3` шарты алдын ала берілген ЖИ бағасымен тексеріледі, әйтпесе оқушы мұғалімнің растауын сағаттап күтер еді. Мұғалім кейін бағаны 3-тен төмен түзетсе, сол `X.3` нәтижесі рейтингте тең балды шешуге қолданылмайды.
4. **Бірнеше сынып (D38).** Оқушы бірнеше сыныпқа қосыла алады, өйткені әр пәннің өз мұғалімі болады. `classes` кестесіне `subject_id` қосылады, ал мұғалім тек сол пән бойынша нәтижені көреді. Профильде бір мұғалім картасының орнына «Мұғалімдер» тізімі тұрады.
5. **Tutor әрқашан қолжетімді (D39).** Tutor-ға сабақ кестесі немесе тәулік уақыты бойынша шектеу қойылмайды. Дабыл мен бұғат ережесі [personarag §6.3](lightrag_personarag.md)-тегідей өзгеріссіз қалады: сабақ үстінде — мұғалім ашқанша, үйде — салқындау таймері (15–30 мин) біткенше. Жүйенің «сабақ үстінде» екенін қалай анықтайтыны Tutor-ды іске асыру кезінде шешіледі (§10, 7-қадам).
6. **Tutor-дың бейресми прогресі (D40).** Бөлек экран жасалмайды. Оқушы прогресін Тьютордан «не үйрендік?» деп сұрағанда көреді ([personarag §6.1](lightrag_personarag.md), `META_REFLECTION`).
7. **«Диалогтар жеке қалады» мәтіні (D41).** Сыныпқа қосылу экранына «мұғалімге тек қауіпсіздік ережесін бұзған хабарлама жіберіледі» деген сөйлем қосылды: дабылдың дәлелі ретінде сол хабарлама мұғалімге көрінеді ([ortaq §5](ortaq-infraqurylym.md)).

---

## 10. Келесі қадам

Іске асыру мына ретпен жүреді:
1. LLM gateway (§7) және оның логы.
2. `examiner` пен `tutor` схемалары, сервис рөлдері, Examiner кестелері.
3. Сұрақ банкі: генерация контуры, Т6 және Т7 тексерулері, `format_applicability`; алдымен 1–2-деңгейдің код форматтары.
4. Examiner сессиясы код форматтарымен: сессия өмірі, Е1 және Е2, нәтиже, профиль. Бұл бірінші толық ағын болады.
5. Examiner-дің ЖИ форматтары, диалог және мұғалімнің растау кезегі.
6. Платформа: `classes`, `lessons` кестесін қайта құру, чат рұқсаты, курстарды алу. Кестелерді өшіру бөлек бекітіледі ([karta §6.2](platforma-kartasy.md)).
7. Tutor.
8. Ойындар: ойын банкі, бөлмелер, төрт ойын ([geimifikatsiya.md](geimifikatsiya.md)).
