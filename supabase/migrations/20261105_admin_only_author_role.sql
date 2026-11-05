-- Мұғалім (teacher) және ата-ана (parent) рөлдерін алып тастап,
-- курс/тест/AI-емтихан авторы ретінде тек админ (admin) рөлін бекіту.

-- 1. Курстар (courses): курс құру және өңдеу тек админге рұқсат етіледі
DROP POLICY IF EXISTS "Teachers create courses" ON public.courses;
CREATE POLICY "Admins create courses"
  ON public.courses
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Teachers update own courses" ON public.courses;
CREATE POLICY "Admins update courses"
  ON public.courses
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Тесттер мен сұрақтар (tests, test_questions): тек админ құрады және өңдейді
DROP POLICY IF EXISTS "Teachers create tests" ON public.tests;
DROP POLICY IF EXISTS "Admins create tests" ON public.tests;
CREATE POLICY "Admins create tests"
  ON public.tests
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Teachers manage own tests" ON public.tests;
DROP POLICY IF EXISTS "Admins manage tests" ON public.tests;
CREATE POLICY "Admins manage tests"
  ON public.tests
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. AI емтихандар (ai_exams): тек админ құрады және барлық AI емтихандарды басқарады
DROP POLICY IF EXISTS "ai_exams_insert_own" ON public.ai_exams;
CREATE POLICY "ai_exams_insert_own"
  ON public.ai_exams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "ai_exams_select_own_or_published" ON public.ai_exams;
CREATE POLICY "ai_exams_select_own_or_published"
  ON public.ai_exams
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "ai_exams_update_own" ON public.ai_exams;
CREATE POLICY "ai_exams_update_own"
  ON public.ai_exams
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ai_exams_delete_own" ON public.ai_exams;
CREATE POLICY "ai_exams_delete_own"
  ON public.ai_exams
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
