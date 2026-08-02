export type Locale = 'kk' | 'ru';

const DEFAULT_LOCALE: Locale = 'kk';
const LOCALE_STORAGE_KEY = 'bilim.locale';

export const translations = {
  // Navigation
  'nav.home': { kk: 'Басты бет', ru: 'Главная' },
  'nav.about': { kk: 'Платформа туралы', ru: 'О платформе' },
  'nav.login': { kk: 'Кіру', ru: 'Войти' },
  'nav.register': { kk: 'Тіркелу', ru: 'Регистрация' },
  'nav.logout': { kk: 'Шығу', ru: 'Выйти' },
  'nav.profile': { kk: 'Профиль', ru: 'Профиль' },
  'nav.dashboard': { kk: 'Басқару тақтасы', ru: 'Панель управления' },
  'nav.courses': { kk: 'Курстар', ru: 'Курсы' },
  'nav.lessons': { kk: 'Сабақтар', ru: 'Уроки' },
  'nav.tests': { kk: 'Тесттер', ru: 'Тесты' },
  'nav.analytics': { kk: 'Аналитика', ru: 'Аналитика' },
  'nav.gamification': { kk: 'Ойындар', ru: 'Игры' },
  'nav.leaderboard': { kk: 'Рейтинг', ru: 'Рейтинг' },
  'nav.achievements': { kk: 'Жетістіктер', ru: 'Достижения' },
  'nav.my_courses': { kk: 'Менің курстарым', ru: 'Мои курсы' },
  'nav.create_course': { kk: 'Курс құру', ru: 'Создать курс' },
  'nav.create_lesson': { kk: 'Сабақ құру', ru: 'Создать урок' },
  'nav.create_test': { kk: 'Тест құру', ru: 'Создать тест' },
  'nav.students': { kk: 'Оқушылар', ru: 'Ученики' },
  'nav.children': { kk: 'Балалар', ru: 'Дети' },
  'nav.child_progress': { kk: 'Бала үлгерімі', ru: 'Прогресс ребенка' },
  'nav.child_tests': { kk: 'Бала тесттері', ru: 'Тесты ребенка' },
  'nav.subjects': { kk: 'Пәндер', ru: 'Предметы' },
  'nav.moderation': { kk: 'Модерация', ru: 'Модерация' },
  'nav.cms': { kk: 'Мазмұн басқару', ru: 'Управление контентом' },
  'nav.users': { kk: 'Пайдаланушылар', ru: 'Пользователи' },
  'nav.child_achievements': { kk: 'Бала жетістіктері', ru: 'Достижения ребенка' },
  'nav.manage_lessons': { kk: 'Сабақтарды басқару', ru: 'Управление уроками' },
  'nav.manage_courses': { kk: 'Курстарды басқару', ru: 'Управление курсами' },
  'nav.manage_tests': { kk: 'Тесттерді басқару', ru: 'Управление тестами' },

  // Auth
  'auth.login_title': { kk: 'Жүйеге кіру', ru: 'Вход в систему' },
  'auth.register_title': { kk: 'Тіркелу', ru: 'Регистрация' },
  'auth.email': { kk: 'Электрондық пошта', ru: 'Электронная почта' },
  'auth.password': { kk: 'Құпия сөз', ru: 'Пароль' },
  'auth.confirm_password': { kk: 'Құпия сөзді растау', ru: 'Подтвердите пароль' },
  'auth.full_name': { kk: 'Толық аты-жөні', ru: 'Полное имя' },
  'auth.role': { kk: 'Рөлі', ru: 'Роль' },
  'auth.login_btn': { kk: 'Кіру', ru: 'Войти' },
  'auth.register_btn': { kk: 'Тіркелу', ru: 'Зарегистрироваться' },
  'auth.no_account': { kk: 'Аккаунтыңыз жоқ па?', ru: 'Нет аккаунта?' },
  'auth.has_account': { kk: 'Аккаунтыңыз бар ма?', ru: 'Есть аккаунт?' },
  'auth.forgot_password': { kk: 'Құпия сөзді ұмыттыңыз ба?', ru: 'Забыли пароль?' },

  // Roles
  'role.student': { kk: 'Оқушы', ru: 'Ученик' },
  'role.teacher': { kk: 'Мұғалім', ru: 'Учитель' },
  'role.parent': { kk: 'Ата-ана', ru: 'Родитель' },
  'role.admin': { kk: 'Әкімшілік', ru: 'Администрация' },

  // Subjects
  'subject.math': { kk: 'Математика', ru: 'Математика' },
  'subject.physics': { kk: 'Физика', ru: 'Физика' },
  'subject.chemistry': { kk: 'Химия', ru: 'Химия' },
  'subject.biology': { kk: 'Биология', ru: 'Биология' },
  'subject.history': { kk: 'Тарих', ru: 'История' },
  'subject.geography': { kk: 'География', ru: 'География' },
  'subject.informatics': { kk: 'Информатика', ru: 'Информатика' },
  'subject.kazakh': { kk: 'Қазақ тілі', ru: 'Казахский язык' },
  'subject.russian': { kk: 'Орыс тілі', ru: 'Русский язык' },
  'subject.english': { kk: 'Ағылшын тілі', ru: 'Английский язык' },

  // Dashboard
  'dashboard.welcome': { kk: 'Қош келдіңіз, {name}', ru: 'Добро пожаловать, {name}' },
  'dashboard.overview': { kk: 'Жалпы шолу', ru: 'Обзор' },
  'dashboard.recent_activity': { kk: 'Соңғы белсенділік', ru: 'Последняя активность' },
  'dashboard.progress': { kk: 'Үлгерім', ru: 'Прогресс' },
  'dashboard.total_students': { kk: 'Барлық оқушылар', ru: 'Всего учеников' },
  'dashboard.total_courses': { kk: 'Барлық курстар', ru: 'Всего курсов' },
  'dashboard.total_lessons': { kk: 'Барлық сабақтар', ru: 'Всего уроков' },
  'dashboard.total_tests': { kk: 'Барлық тесттер', ru: 'Всего тестов' },
  'dashboard.avg_score': { kk: 'Орташа балл', ru: 'Средний балл' },
  'dashboard.completed': { kk: 'Аяқталған', ru: 'Завершено' },
  'dashboard.in_progress': { kk: 'Орындалып жатыр', ru: 'В процессе' },
  'dashboard.streak': { kk: 'Серия', ru: 'Серия' },
  'dashboard.points': { kk: 'Ұпай', ru: 'Баллы' },
  'dashboard.level': { kk: 'Деңгей', ru: 'Уровень' },
  'dashboard.rank': { kk: 'Орын', ru: 'Место' },
  'dashboard.enrolled_courses': { kk: 'Менің курстарым', ru: 'Мои курсы' },
  'dashboard.continue_learning': { kk: 'Оқуды жалғастыру', ru: 'Продолжить обучение' },
  'dashboard.best_subject': { kk: 'Күшті пән', ru: 'Сильный предмет' },
  'dashboard.weak_subject': { kk: 'Назар аудару керек пән', ru: 'Предмет, требующий внимания' },

  // Landing
  'landing.hero_title': { kk: 'Білім алудың жаңа деңгейі', ru: 'Новый уровень образования' },
  'landing.hero_subtitle': {
    kk: 'Мектеп пәндерін оқып, ҰБТ-ға дайындалыңыз. Интерактивті сабақтар мен тесттер арқылы жүйелі білім алыңыз.',
    ru: 'Изучайте школьные предметы и готовьтесь к ЕНТ. Получайте системные знания через интерактивные уроки и тесты.',
  },
  'landing.start_learning': { kk: 'Оқуды бастау', ru: 'Начать обучение' },
  'landing.learn_more': { kk: 'Толығырақ', ru: 'Подробнее' },
  'landing.features_title': { kk: 'Платформа мүмкіндіктері', ru: 'Возможности платформы' },
  'landing.feature_courses': { kk: 'Құрылымдалған курстар', ru: 'Структурированные курсы' },
  'landing.feature_courses_desc': { kk: 'Мектеп пәндері бойынша жүйелі сабақтар мен курстар', ru: 'Системные уроки и курсы по школьным предметам' },
  'landing.feature_tests': { kk: 'ҰБТ тесттері', ru: 'Тесты ЕНТ' },
  'landing.feature_tests_desc': { kk: 'ҰБТ форматына жақын тест тапсырмалары', ru: 'Тестовые задания в формате, близком к ЕНТ' },
  'landing.feature_analytics': { kk: 'Үлгерімді талдау', ru: 'Анализ прогресса' },
  'landing.feature_analytics_desc': { kk: 'Нәтижелерді бақылап, әлсіз тұстарды анықтаңыз', ru: 'Отслеживайте результаты и определяйте слабые места' },
  'landing.feature_games': { kk: 'Қызықты оқу', ru: 'Увлекательное обучение' },
  'landing.feature_games_desc': { kk: 'Оқу процесін қызықты ететін элементтер', ru: 'Элементы, делающие обучение увлекательнее' },
  'landing.for_students': { kk: 'Оқушыларға', ru: 'Ученикам' },
  'landing.for_teachers': { kk: 'Мұғалімдерге', ru: 'Учителям' },
  'landing.for_parents': { kk: 'Ата-аналарға', ru: 'Родителям' },
  'landing.stats_students': { kk: 'Оқушылар', ru: 'Ученики' },
  'landing.stats_courses': { kk: 'Курстар', ru: 'Курсы' },
  'landing.stats_tests': { kk: 'Тесттер', ru: 'Тесты' },
  'landing.stats_subjects': { kk: 'Пәндер', ru: 'Предметы' },

  // Course
  'course.catalog': { kk: 'Курс каталогы', ru: 'Каталог курсов' },
  'course.enroll': { kk: 'Курсқа жазылу', ru: 'Записаться на курс' },
  'course.continue': { kk: 'Оқуды жалғастыру', ru: 'Продолжить обучение' },
  'course.progress': { kk: 'Үлгерім', ru: 'Прогресс' },
  'course.modules': { kk: 'Модульдер', ru: 'Модули' },
  'course.lessons_count': { kk: 'сабақ', ru: 'уроков' },
  'course.status.draft': { kk: 'Жоба', ru: 'Черновик' },
  'course.status.review': { kk: 'Қаралуда', ru: 'На проверке' },
  'course.status.published': { kk: 'Жарияланған', ru: 'Опубликован' },
  'course.status.archived': { kk: 'Мұрағатта', ru: 'В архиве' },

  // Test
  'test.start': { kk: 'Тестті бастау', ru: 'Начать тест' },
  'test.submit': { kk: 'Жауаптарды жіберу', ru: 'Отправить ответы' },
  'test.result': { kk: 'Нәтиже', ru: 'Результат' },
  'test.retake': { kk: 'Қайта тапсыру', ru: 'Пересдать' },
  'test.time_left': { kk: 'Қалған уақыт', ru: 'Оставшееся время' },
  'test.correct': { kk: 'Дұрыс жауап', ru: 'Правильный ответ' },
  'test.incorrect': { kk: 'Қате жауап', ru: 'Неправильный ответ' },
  'test.score': { kk: 'Нәтиже', ru: 'Результат' },

  // Shared state
  'state.loading.title': { kk: 'Деректер жүктеліп жатыр', ru: 'Данные загружаются' },
  'state.loading.text': { kk: 'Аз уақыт күтіңіз.', ru: 'Пожалуйста, подождите немного.' },
  'state.error.title': { kk: 'Бетті жүктеу мүмкін болмады', ru: 'Не удалось загрузить страницу' },
  'state.error.retry_hint': {
    kk: 'Бетті қайта жүктеп көріңіз немесе сәл кейінірек қайталаңыз.',
    ru: 'Попробуйте обновить страницу или повторите попытку немного позже.',
  },
  'state.empty.default_title': { kk: 'Әзірге ештеңе жоқ', ru: 'Пока ничего нет' },
  'state.empty.default_text': {
    kk: 'Жаңа мәлімет пайда болған кезде осы жерде көрінеді.',
    ru: 'Когда появятся новые данные, они отобразятся здесь.',
  },

  // Common actions and labels
  'common.open_menu': { kk: 'Мәзірді ашу', ru: 'Открыть меню' },
  'common.close': { kk: 'Жабу', ru: 'Закрыть' },
  'common.search': { kk: 'Іздеу', ru: 'Поиск' },
  'common.filter': { kk: 'Сүзгі', ru: 'Фильтр' },
  'common.save': { kk: 'Сақтау', ru: 'Сохранить' },
  'common.cancel': { kk: 'Болдырмау', ru: 'Отмена' },
  'common.edit': { kk: 'Өзгерту', ru: 'Редактировать' },
  'common.delete': { kk: 'Жою', ru: 'Удалить' },
  'common.view': { kk: 'Қарау', ru: 'Просмотр' },
  'common.back': { kk: 'Артқа', ru: 'Назад' },
  'common.next': { kk: 'Келесі', ru: 'Далее' },
  'common.previous': { kk: 'Алдыңғы', ru: 'Предыдущий' },
  'common.loading': { kk: 'Жүктелуде...', ru: 'Загрузка...' },
  'common.no_data': { kk: 'Деректер табылмады', ru: 'Данные не найдены' },
  'common.approve': { kk: 'Бекіту', ru: 'Одобрить' },
  'common.reject': { kk: 'Қабылдамау', ru: 'Отклонить' },
  'common.all': { kk: 'Барлығы', ru: 'Все' },
  'common.locked': { kk: 'Қолжетімсіз', ru: 'Недоступно' },
  'common.unlocked': { kk: 'Ашық', ru: 'Открыто' },
  'common.completed': { kk: 'Аяқталды', ru: 'Завершено' },
  'common.retry': { kk: 'Қайта көру', ru: 'Повторить' },
  'common.refresh': { kk: 'Жаңарту', ru: 'Обновить' },

  'page.lessons.title.student': { kk: 'Сабақтар', ru: 'Уроки' },
  'page.lessons.title.admin': { kk: 'Сабақтарды басқару', ru: 'Управление уроками' },
    'page.student_dashboard.greeting_subtitle': {
    kk: 'Бүгінгі оқу бағытын жалғастырып, келесі сабақты аяқтауға назар аударыңыз.',
    ru: 'Продолжайте обучение сегодня и сосредоточьтесь на следующем уроке.'
  },
  'page.student_dashboard.next_step': {
    kk: 'Бүгінгі келесі қадам',
    ru: 'Следующий шаг на сегодня'
  },
  'page.student_dashboard.next_lessons': {
    kk: 'Келесі сабақтар',
    ru: 'Следующие уроки'
  },
  'page.student_dashboard.recent_tests': {
    kk: 'Соңғы тесттер',
    ru: 'Последние тесты'
  },
  'page.student_dashboard.progress_overview': {
    kk: 'Үлгерімге шолу',
    ru: 'Обзор прогресса'
  },
  'page.student_dashboard.learning_pace': {
    kk: 'Оқу қарқыны',
    ru: 'Темп обучения'
  },
  'page.student_dashboard.attention_subject': {
    kk: 'Назар аудару керек пән',
    ru: 'Предмет, требующий внимания'
  },
  'page.student_dashboard.rank_label': {
    kk: 'Рейтингтегі орныңыз',
    ru: 'Ваше место в рейтинге'
  },

  'page.student_dashboard.empty.courses_title': {
    kk: 'Курстар әлі қосылмаған',
    ru: 'Курсы пока не добавлены'
  },
  'page.student_dashboard.empty.courses_text': {
    kk: 'Курсқа жазылғаннан кейін олардың прогресі осы жерде көрінеді.',
    ru: 'После записи на курс их прогресс появится здесь.'
  },
  'page.student_dashboard.empty.next_lesson_title': {
    kk: 'Келесі сабақ әзірге қолжетімді емес',
    ru: 'Следующий урок пока недоступен'
  },
  'page.student_dashboard.empty.next_lesson_text': {
    kk: 'Жаңа сабақтар қосылғаннан кейін олар осы жерде көрінеді.',
    ru: 'После добавления новых уроков они появятся здесь.'
  },
  'page.student_dashboard.empty.tests_title': {
    kk: 'Соңғы тест нәтижелері әлі жоқ',
    ru: 'Пока нет результатов тестов'
  },
  'page.student_dashboard.empty.tests_text': {
    kk: 'Тест тапсырғаннан кейін нәтижелер осы жерде көрінеді.',
    ru: 'После прохождения тестов результаты появятся здесь.'
  },

  'page.student_dashboard.status.excellent': {
    kk: 'Өте жақсы қарқын',
    ru: 'Очень хороший темп'
  },
  'page.student_dashboard.status.good': {
    kk: 'Жақсы ілгерілеу',
    ru: 'Хороший прогресс'
  },
  'page.student_dashboard.status.attention': {
    kk: 'Қосымша назар қажет',
    ru: 'Требуется дополнительное внимание'
  },

  'page.student_dashboard.lesson_continue_hint': {
    kk: 'Сабақты жалғастырып, прогресті сақтаңыз.',
    ru: 'Продолжайте урок и сохраняйте прогресс.'
  },
  'page.student_dashboard.lesson_locked_hint': {
    kk: 'Бұл сабаққа өту үшін алдыңғы бөлімдерді аяқтау қажет.',
    ru: 'Чтобы перейти к этому уроку, нужно завершить предыдущие разделы.'
  },
  'page.student_dashboard.completed_lessons': {
    kk: 'Аяқталған сабақтар',
    ru: 'Завершенные уроки'
  },

  'page.lessons.description.student': {
    kk: 'Бұл бөлімде сізге қолжетімді сабақтар, олардың мәртебесі және оқу реттілігі көрсетіледі.',
    ru: 'В этом разделе отображаются доступные вам уроки, их статус и порядок обучения.'
  },
  'page.lessons.description.admin': {
    kk: 'Бұл бөлімде жарияланған сабақтар тізімі көрсетіледі және оларды шолуға болады.',
    ru: 'В этом разделе отображается список опубликованных уроков и доступен их обзор.'
  },
  

  'page.lessons.loading': {
    kk: 'Сабақтар жүктеліп жатыр...',
    ru: 'Уроки загружаются...'
  },
  'page.lessons.error': {
    kk: 'Сабақтар тізімін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить список уроков.'
  },

  'page.lessons.list_title.student': {
    kk: 'Сізге қолжетімді сабақтар',
    ru: 'Доступные вам уроки'
  },
  'page.lessons.list_title.admin': {
    kk: 'Сабақтар тізімі',
    ru: 'Список уроков'
  },

  'page.lessons.empty.title.student': {
    kk: 'Сабақтар әлі қолжетімді емес',
    ru: 'Уроки пока недоступны'
  },
  'page.lessons.empty.text.student': {
    kk: 'Сабақтар жарияланғаннан кейін олар осы жерде көрінеді.',
    ru: 'После публикации уроков они появятся здесь.'
  },
  'page.lessons.empty.title.admin': {
    kk: 'Сабақтар табылмады',
    ru: 'Уроки не найдены'
  },
  'page.lessons.empty.text.admin': {
    kk: 'Бұл бөлімде сабақтар пайда болуы үшін алдымен оларды қосу немесе жариялау қажет.',
    ru: 'Чтобы уроки появились в этом разделе, их нужно сначала добавить или опубликовать.'
  },

  'page.lessons.empty.title.filtered': {
    kk: 'Бұл пән бойынша сабақ табылмады',
    ru: 'По этому предмету уроки не найдены'
  },
  'page.lessons.empty.text.filtered': {
    kk: 'Басқа пәнді таңдап көріңіз немесе сүзгіні алып тастаңыз.',
    ru: 'Попробуйте выбрать другой предмет или сбросить фильтр.'
  },

  'lesson.status.completed': {
    kk: 'Аяқталды',
    ru: 'Завершено'
  },
  'lesson.status.available': {
    kk: 'Бастауға болады',
    ru: 'Можно начать'
  },

  'lesson.action.complete': {
    kk: 'Аяқтау',
    ru: 'Завершить'
  },

  'lesson.toast.complete_title': {
    kk: 'Сабақ аяқталды',
    ru: 'Урок завершен'
  },
  'lesson.toast.complete_text': {
    kk: 'Прогресіңіз жаңартылды.',
    ru: 'Ваш прогресс обновлен.'
  },
  'lesson.toast.error_title': {
    kk: 'Сабақты аяқтау мүмкін болмады',
    ru: 'Не удалось завершить урок'
  },
  'lesson.toast.error_text': {
    kk: 'Қайтадан көріңіз.',
    ru: 'Попробуйте еще раз.'
  },
    'common.days': { kk: 'күн', ru: 'дней' },
  'common.not_defined_yet': { kk: 'Әзірге анықталмаған', ru: 'Пока не определено' },

  'page.student_dashboard.my_courses': { kk: 'Менің курстарым', ru: 'Мои курсы' },
    'common.minutes': { kk: 'мин', ru: 'мин' },

  'page.tests.description.student': {
    kk: 'Бұл бөлімде тесттерді бастап, нәтижелеріңізді қарап, өз деңгейіңізді бағалай аласыз.',
    ru: 'В этом разделе можно проходить тесты, смотреть результаты и оценивать свой уровень.'
  },
  'page.tests.description.admin': {
    kk: 'Бұл бөлімде жарияланған тесттер тізімі көрсетіледі.',
    ru: 'В этом разделе отображается список опубликованных тестов.'
  },

  'page.tests.loading': {
    kk: 'Тесттер жүктеліп жатыр...',
    ru: 'Тесты загружаются...'
  },
  'page.tests.error': {
    kk: 'Тесттер тізімін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить список тестов.'
  },

  'page.tests.empty.title': {
    kk: 'Тесттер әлі қолжетімді емес',
    ru: 'Тесты пока недоступны'
  },
  'page.tests.empty.text': {
    kk: 'Тесттер жарияланғаннан кейін олар осы жерде көрінеді.',
    ru: 'После публикации тестов они появятся здесь.'
  },

  'page.tests.empty.filtered_title': {
    kk: 'Бұл пән бойынша тест табылмады',
    ru: 'По этому предмету тесты не найдены'
  },
  'page.tests.empty.filtered_text': {
    kk: 'Басқа пәнді таңдап көріңіз немесе сүзгіні алып тастаңыз.',
    ru: 'Попробуйте выбрать другой предмет или сбросить фильтр.'
  },

  'page.tests.empty.questions_title': {
    kk: 'Сұрақтар әлі жүктелмеді',
    ru: 'Вопросы пока не загружены'
  },
  'page.tests.empty.questions_text': {
    kk: 'Тестті қайта ашып көріңіз.',
    ru: 'Попробуйте открыть тест еще раз.'
  },

  'page.tests.toast.start_error_title': {
    kk: 'Тестті ашу мүмкін болмады',
    ru: 'Не удалось открыть тест'
  },
  'page.tests.toast.start_error_text': {
    kk: 'Қайтадан көріңіз.',
    ru: 'Попробуйте еще раз.'
  },
  'page.tests.toast.submit_error_title': {
    kk: 'Тест нәтижесін сақтау мүмкін болмады',
    ru: 'Не удалось сохранить результат теста'
  },
  'page.tests.toast.submit_error_text': {
    kk: 'Қайтадан көріңіз.',
    ru: 'Попробуйте еще раз.'
  },

  'page.tests.question_counter': {
    kk: 'Сұрақ {current}/{total}',
    ru: 'Вопрос {current}/{total}'
  },
  'page.tests.question_number': {
    kk: 'Сұрақ {number}',
    ru: 'Вопрос {number}'
  },

  'page.tests.single_choice_hint': {
    kk: 'Бір жауап таңдаңыз',
    ru: 'Выберите один ответ'
  },
  'page.tests.multiple_choice_hint': {
    kk: 'Бірнеше жауап таңдаңыз',
    ru: 'Выберите несколько ответов'
  },

  'page.tests.answer.not_answered': {
    kk: 'Жауап берілмеген',
    ru: 'Ответ не дан'
  },
  'page.tests.your_answer': {
    kk: 'Сіздің жауабыңыз',
    ru: 'Ваш ответ'
  },
  'page.tests.correct_answer': {
    kk: 'Дұрыс жауап',
    ru: 'Правильный ответ'
  },
  'page.tests.explanation': {
    kk: 'Түсіндірме',
    ru: 'Пояснение'
  },

  'page.tests.result_summary': {
    kk: '{correct}/{total} дұрыс жауап',
    ru: '{correct}/{total} правильных ответов'
  },

  'page.tests.back_to_list': {
    kk: 'Тізімге оралу',
    ru: 'Вернуться к списку'
  },

  'page.tests.questions_label': {
    kk: 'сұрақ',
    ru: 'вопросов'
  },
  'page.tests.attempts_label': {
    kk: 'әрекет',
    ru: 'попыток'
  },
  'page.tests.published_status': {
    kk: 'Жарияланған тест',
    ru: 'Опубликованный тест'
  },
    'page.leaderboard.description': {
    kk: 'Бұл бөлімде қатысушылардың ұпайы, орташа нәтижесі және оқу белсенділігі бойынша жалпы рейтинг көрсетіледі.',
    ru: 'В этом разделе отображается общий рейтинг участников по баллам, среднему результату и учебной активности.'
  },
  'page.leaderboard.loading': {
    kk: 'Рейтинг жүктеліп жатыр...',
    ru: 'Рейтинг загружается...'
  },
  'page.leaderboard.error': {
    kk: 'Рейтингті жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить рейтинг.'
  },
  'page.leaderboard.empty.title': {
    kk: 'Рейтинг әзірге бос',
    ru: 'Рейтинг пока пуст'
  },
  'page.leaderboard.empty.text': {
    kk: 'Қатысушылардың нәтижелері пайда болғаннан кейін рейтинг осы жерде көрінеді.',
    ru: 'Когда появятся результаты участников, рейтинг отобразится здесь.'
  },
  'page.leaderboard.full_title': {
    kk: 'Толық рейтинг',
    ru: 'Полный рейтинг'
  },
  'page.leaderboard.points_label': {
    kk: 'ұпай',
    ru: 'баллы'
  },
  'page.leaderboard.avg_score_label': {
    kk: 'Орташа нәтиже',
    ru: 'Средний результат'
  },
  'page.leaderboard.lessons_completed_label': {
    kk: 'Аяқталған сабақтар',
    ru: 'Завершенные уроки'
  },
    'page.gamification.title.games': {
    kk: 'Ойындар',
    ru: 'Игры'
  },
  'page.gamification.title.achievements': {
    kk: 'Жетістіктер',
    ru: 'Достижения'
  },

  'page.gamification.description.games': {
    kk: 'Бұл бөлімде оқу процесін қызықты ететін ойын элементтері мен белсенді ойындар көрсетіледі.',
    ru: 'В этом разделе отображаются игровые элементы и активные игры, делающие обучение интереснее.'
  },
  'page.gamification.description.achievements': {
    kk: 'Бұл бөлімде сіздің жетістіктеріңіз, жиналған ұпайларыңыз және алға жылжу көрсеткіштеріңіз көрсетіледі.',
    ru: 'В этом разделе отображаются ваши достижения, накопленные баллы и показатели прогресса.'
  },

  'page.gamification.loading': {
    kk: 'Ойындар мен жетістіктер жүктеліп жатыр...',
    ru: 'Игры и достижения загружаются...'
  },
  'page.gamification.error': {
    kk: 'Бұл бөлімдегі мәліметтерді жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные этого раздела.'
  },

  'page.gamification.empty.title': {
    kk: 'Мәліметтер әзірге қолжетімді емес',
    ru: 'Данные пока недоступны'
  },
  'page.gamification.empty.text': {
    kk: 'Жаңа белсенділік пайда болған кезде бұл бөлім жаңартылады.',
    ru: 'Когда появится новая активность, этот раздел обновится.'
  },

  'page.gamification.stats.points': {
    kk: 'Ұпайлар',
    ru: 'Баллы'
  },
  'page.gamification.stats.achievements': {
    kk: 'Жетістіктер',
    ru: 'Достижения'
  },
  'page.gamification.stats.games': {
    kk: 'Ойындар',
    ru: 'Игры'
  },

  'page.gamification.achievements_title': {
    kk: 'Жетістіктер',
    ru: 'Достижения'
  },
  'page.gamification.games_title': {
    kk: 'Белсенді ойындар',
    ru: 'Активные игры'
  },

  'page.gamification.empty.achievements_title': {
    kk: 'Жетістіктер әлі жоқ',
    ru: 'Достижений пока нет'
  },
  'page.gamification.empty.achievements_text': {
    kk: 'Оқу белсенділігі артқан сайын жаңа жетістіктер осы жерде көрінеді.',
    ru: 'По мере роста учебной активности здесь будут появляться новые достижения.'
  },

  'page.gamification.empty.games_title': {
    kk: 'Белсенді ойындар табылмады',
    ru: 'Активные игры не найдены'
  },
  'page.gamification.empty.games_text': {
    kk: 'Қолжетімді ойындар пайда болған кезде олар осы жерде көрсетіледі.',
    ru: 'Когда станут доступны игры, они появятся здесь.'
  },

  'page.gamification.game_type_label': {
    kk: 'Түрі',
    ru: 'Тип'
  },

  'page.gamification.earned_status': {
    kk: 'Ашылған жетістік',
    ru: 'Достижение получено'
  },
  'page.gamification.locked_status': {
    kk: 'Әлі ашылмаған',
    ru: 'Пока не получено'
  },
    'page.teacher_dashboard.subtitle': {
    kk: 'Курстарыңызды басқарып, оқушылардың оқу барысын осы жерден қадағалаңыз.',
    ru: 'Управляйте своими курсами и отслеживайте прогресс учеников отсюда.'
  },
  'page.teacher_dashboard.loading': {
    kk: 'Мұғалім кабинеті жүктеліп жатыр...',
    ru: 'Кабинет учителя загружается...'
  },
  'page.teacher_dashboard.error': {
    kk: 'Мұғалім кабинетінің деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные кабинета учителя.'
  },
  'page.teacher_dashboard.empty.title': {
    kk: 'Мәліметтер әзірге қолжетімді емес',
    ru: 'Данные пока недоступны'
  },
  'page.teacher_dashboard.empty.text': {
    kk: 'Жаңа деректер пайда болған кезде бұл бөлім жаңартылады.',
    ru: 'Когда появятся новые данные, этот раздел обновится.'
  },

  'page.teacher_dashboard.courses_empty.title': {
    kk: 'Курстар әлі жоқ',
    ru: 'Курсов пока нет'
  },
  'page.teacher_dashboard.courses_empty.text': {
    kk: 'Алғашқы курсты құрғаннан кейін ол осы жерде көрінеді.',
    ru: 'После создания первого курса он появится здесь.'
  },

  'page.teacher_dashboard.quick_actions': {
    kk: 'Жылдам әрекеттер',
    ru: 'Быстрые действия'
  },
  'page.teacher_dashboard.action.create_course': {
    kk: 'Жаңа курс құру',
    ru: 'Создать новый курс'
  },
  'page.teacher_dashboard.action.create_test': {
    kk: 'Тест жасау',
    ru: 'Создать тест'
  },

  'page.teacher_dashboard.summary_title': {
    kk: 'Қысқаша шолу',
    ru: 'Краткий обзор'
  },
  'page.teacher_dashboard.students_label': {
    kk: 'оқушы',
    ru: 'учеников'
  },
    'page.teacher_course_builder.title': {
    kk: 'Курстарды құру және басқару',
    ru: 'Создание и управление курсами'
  },
  'page.teacher_course_builder.subtitle': {
    kk: 'Бұл бөлімде жаңа курс ашып, модульдер мен сабақтарды толықтырып, жариялау күйін басқара аласыз.',
    ru: 'В этом разделе можно создавать новые курсы, дополнять их модулями и уроками и управлять публикацией.'
  },

  'page.teacher_course_builder.section.new_course': {
    kk: 'Жаңа курс',
    ru: 'Новый курс'
  },
  'page.teacher_course_builder.section.manage_courses': {
    kk: 'Бар курстарды басқару',
    ru: 'Управление существующими курсами'
  },
  'page.teacher_course_builder.section.modules_lessons': {
    kk: 'Модульдер мен сабақтар',
    ru: 'Модули и уроки'
  },
  'page.teacher_course_builder.section.new_lesson': {
    kk: 'Жаңа сабақ қосу',
    ru: 'Добавить новый урок'
  },
  'page.teacher_course_builder.section.edit_lesson': {
    kk: 'Сабақты өңдеу',
    ru: 'Редактировать урок'
  },

  'page.teacher_course_builder.field.course_title': {
    kk: 'Курс атауы',
    ru: 'Название курса'
  },
  'page.teacher_course_builder.field.description': {
    kk: 'Сипаттама',
    ru: 'Описание'
  },
  'page.teacher_course_builder.field.subject': {
    kk: 'Пән',
    ru: 'Предмет'
  },
  'page.teacher_course_builder.field.initial_module': {
    kk: 'Бастапқы модуль',
    ru: 'Начальный модуль'
  },
  'page.teacher_course_builder.field.intro_lesson': {
    kk: 'Кіріспе сабақ',
    ru: 'Вводный урок'
  },
  'page.teacher_course_builder.field.lesson_title': {
    kk: 'Сабақ атауы',
    ru: 'Название урока'
  },
  'page.teacher_course_builder.field.module': {
    kk: 'Модуль',
    ru: 'Модуль'
  },
  'page.teacher_course_builder.field.new_module_title': {
    kk: 'Жаңа модуль атауы',
    ru: 'Название нового модуля'
  },
  'page.teacher_course_builder.field.theory': {
    kk: 'Теория',
    ru: 'Теория'
  },
  'page.teacher_course_builder.field.practice': {
    kk: 'Практика',
    ru: 'Практика'
  },
  'page.teacher_course_builder.field.video_url': {
    kk: 'Видео сілтемесі',
    ru: 'Ссылка на видео'
  },
  'page.teacher_course_builder.field.thumbnail': {
    kk: 'Миниатюра сілтемесі',
    ru: 'Ссылка на миниатюру'
  },
  'page.teacher_course_builder.field.status': {
    kk: 'Курс күйі',
    ru: 'Статус курса'
  },
  'page.teacher_course_builder.field.sort_order': {
    kk: 'Реті',
    ru: 'Порядок'
  },
  'page.teacher_course_builder.field.lesson_published': {
    kk: 'Сабақты жариялау',
    ru: 'Опубликовать урок'
  },

  'page.teacher_course_builder.placeholder.course_title': {
    kk: 'Мысалы, Алгебра негіздері',
    ru: 'Например, Основы алгебры'
  },
  'page.teacher_course_builder.placeholder.description': {
    kk: 'Курс не туралы екенін қысқаша жазыңыз',
    ru: 'Кратко опишите, о чем этот курс'
  },
  'page.teacher_course_builder.placeholder.select_subject': {
    kk: 'Пәнді таңдаңыз',
    ru: 'Выберите предмет'
  },
  'page.teacher_course_builder.placeholder.select_module': {
    kk: 'Модуль таңдаңыз',
    ru: 'Выберите модуль'
  },
  'page.teacher_course_builder.placeholder.module_title': {
    kk: 'Мысалы, 2-модуль: Алгоритмдер',
    ru: 'Например, Модуль 2: Алгоритмы'
  },

  'page.teacher_course_builder.action.create_course': {
    kk: 'Курс жасау',
    ru: 'Создать курс'
  },
  'page.teacher_course_builder.action.save_course': {
    kk: 'Курсты сақтау',
    ru: 'Сохранить курс'
  },
  'page.teacher_course_builder.action.add_module': {
    kk: 'Модуль қосу',
    ru: 'Добавить модуль'
  },
  'page.teacher_course_builder.action.add_lesson': {
    kk: 'Сабақ қосу',
    ru: 'Добавить урок'
  },
  'page.teacher_course_builder.action.update_lesson': {
    kk: 'Сабақты жаңарту',
    ru: 'Обновить урок'
  },
  'page.teacher_course_builder.action.clear_form': {
    kk: 'Тазалау',
    ru: 'Очистить'
  },
  'page.teacher_course_builder.action.saving': {
    kk: 'Сақталуда...',
    ru: 'Сохранение...'
  },

  'page.teacher_course_builder.empty.courses_title': {
    kk: 'Курстар әлі жоқ',
    ru: 'Курсов пока нет'
  },
  'page.teacher_course_builder.empty.courses_text': {
    kk: 'Алғашқы курсты құрғаннан кейін ол осы жерде көрінеді.',
    ru: 'После создания первого курса он появится здесь.'
  },
  'page.teacher_course_builder.empty.select_course_title': {
    kk: 'Курсты таңдаңыз',
    ru: 'Выберите курс'
  },
  'page.teacher_course_builder.empty.select_course_text': {
    kk: 'Редакциялауды жалғастыру үшін сол жақ тізімнен курсты таңдаңыз.',
    ru: 'Чтобы продолжить редактирование, выберите курс из списка слева.'
  },
  'page.teacher_course_builder.empty.modules_title': {
    kk: 'Модульдер әлі жоқ',
    ru: 'Модулей пока нет'
  },
  'page.teacher_course_builder.empty.modules_text': {
    kk: 'Жаңа модуль қосқаннан кейін ол осы жерде көрінеді.',
    ru: 'После добавления нового модуля он появится здесь.'
  },
  'page.teacher_course_builder.empty.lessons_inline': {
    kk: 'Бұл модульде сабақтар әлі жоқ',
    ru: 'В этом модуле пока нет уроков'
  },

  'page.teacher_course_builder.toast.create_course_title': {
    kk: 'Курс жасалды',
    ru: 'Курс создан'
  },
  'page.teacher_course_builder.toast.create_course_text': {
    kk: 'Курс, бастапқы модуль және кіріспе сабақ сақталды.',
    ru: 'Курс, начальный модуль и вводный урок сохранены.'
  },
  'page.teacher_course_builder.toast.update_course_title': {
    kk: 'Курс жаңартылды',
    ru: 'Курс обновлен'
  },
  'page.teacher_course_builder.toast.add_module_title': {
    kk: 'Модуль қосылды',
    ru: 'Модуль добавлен'
  },
  'page.teacher_course_builder.toast.add_lesson_title': {
    kk: 'Сабақ қосылды',
    ru: 'Урок добавлен'
  },
  'page.teacher_course_builder.toast.update_lesson_title': {
    kk: 'Сабақ жаңартылды',
    ru: 'Урок обновлен'
  },
  'page.teacher_course_builder.toast.update_module_title': {
    kk: 'Модуль жаңартылды',
    ru: 'Модуль обновлен'
  },
  'page.teacher_course_builder.toast.update_status_title': {
    kk: 'Курс күйі жаңартылды',
    ru: 'Статус курса обновлен'
  },
  'page.teacher_course_builder.toast.error_title': {
    kk: 'Әрекетті орындау мүмкін болмады',
    ru: 'Не удалось выполнить действие'
  },
  'page.teacher_course_builder.toast.error_text': {
    kk: 'Өзгерістерді қайтадан сақтап көріңіз.',
    ru: 'Попробуйте сохранить изменения еще раз.'
  },

  'page.teacher_course_builder.status.under_review': {
    kk: 'Қарауға жіберілген',
    ru: 'Отправлен на проверку'
  },
  'page.teacher_course_builder.lesson_status.draft': {
    kk: 'Жоба',
    ru: 'Черновик'
  },
  'page.teacher_course_builder.lesson_status.published': {
    kk: 'Жарияланған',
    ru: 'Опубликован'
  },
  'page.teacher_course_builder.lesson_has_video': {
    kk: 'видео бар',
    ru: 'есть видео'
  },

  'page.teacher_course_builder.students_label': {
    kk: 'оқушы',
    ru: 'учеников'
  },

  'page.teacher_course_builder.defaults.module_title': {
    kk: '1-модуль: Кіріспе',
    ru: 'Модуль 1: Введение'
  },
  'page.teacher_course_builder.defaults.module_short': {
    kk: '1-модуль',
    ru: 'Модуль 1'
  },
  'page.teacher_course_builder.defaults.lesson_title': {
    kk: 'Кіріспе сабақ',
    ru: 'Вводный урок'
  },
  'page.teacher_course_builder.defaults.lesson_short': {
    kk: 'Кіріспе сабақ',
    ru: 'Вводный урок'
  },
  'page.teacher_course_builder.defaults.lesson_body': {
    kk: 'Бұл бөлімде курс құрылымы, мақсаттары және оқу тәртібі түсіндіріледі.',
    ru: 'В этом разделе объясняются структура курса, цели и порядок обучения.'
  },
  'page.teacher_course_builder.defaults.lesson_practice': {
    kk: 'Сабақты оқып шығып, курс бөлімдерімен танысыңыз.',
    ru: 'Ознакомьтесь с уроком и разделами курса.'
  },
    'page.teacher_test_builder.title': {
    kk: 'Тесттерді құру және басқару',
    ru: 'Создание и управление тестами'
  },
  'page.teacher_test_builder.subtitle': {
    kk: 'Бұл бөлімде жаңа тест құрып, сұрақтарды толықтырып, жариялау күйін басқара аласыз.',
    ru: 'В этом разделе можно создавать новые тесты, дополнять их вопросами и управлять публикацией.'
  },

  'page.teacher_test_builder.section.new_test': {
    kk: 'Жаңа тест',
    ru: 'Новый тест'
  },
  'page.teacher_test_builder.section.manage_tests': {
    kk: 'Бар тесттерді басқару',
    ru: 'Управление существующими тестами'
  },
  'page.teacher_test_builder.section.questions': {
    kk: 'Сұрақтар',
    ru: 'Вопросы'
  },
  'page.teacher_test_builder.section.new_question': {
    kk: 'Жаңа сұрақ қосу',
    ru: 'Добавить новый вопрос'
  },
  'page.teacher_test_builder.section.edit_question': {
    kk: 'Сұрақты өңдеу',
    ru: 'Редактировать вопрос'
  },

  'page.teacher_test_builder.field.test_title': {
    kk: 'Тест атауы',
    ru: 'Название теста'
  },
  'page.teacher_test_builder.field.topic': {
    kk: 'Тақырып',
    ru: 'Тема'
  },
  'page.teacher_test_builder.field.duration': {
    kk: 'Ұзақтығы (мин)',
    ru: 'Длительность (мин)'
  },
  'page.teacher_test_builder.field.subject': {
    kk: 'Пән',
    ru: 'Предмет'
  },
  'page.teacher_test_builder.field.status': {
    kk: 'Тест күйі',
    ru: 'Статус теста'
  },
  'page.teacher_test_builder.field.question_text': {
    kk: 'Сұрақ мәтіні',
    ru: 'Текст вопроса'
  },
  'page.teacher_test_builder.field.options': {
    kk: 'Жауап нұсқалары (әр жолға біреу)',
    ru: 'Варианты ответа (по одному в строке)'
  },
  'page.teacher_test_builder.field.correct_answer': {
    kk: 'Дұрыс жауап нөмірі',
    ru: 'Номер правильного ответа'
  },
  'page.teacher_test_builder.field.sort_order': {
    kk: 'Реті',
    ru: 'Порядок'
  },
  'page.teacher_test_builder.field.multiple_choice': {
    kk: 'Көп жауапты сұрақ',
    ru: 'Вопрос с несколькими ответами'
  },
  'page.teacher_test_builder.field.explanation': {
    kk: 'Түсіндірме',
    ru: 'Пояснение'
  },

  'page.teacher_test_builder.placeholder.test_title': {
    kk: 'Мысалы, Алгебра бойынша бақылау тесті',
    ru: 'Например, Контрольный тест по алгебре'
  },
  'page.teacher_test_builder.placeholder.topic': {
    kk: 'Мысалы, Квадрат теңдеулер',
    ru: 'Например, Квадратные уравнения'
  },
  'page.teacher_test_builder.placeholder.select_subject': {
    kk: 'Пәнді таңдаңыз',
    ru: 'Выберите предмет'
  },
  'page.teacher_test_builder.placeholder.correct_answer': {
    kk: '1 немесе 1,3',
    ru: '1 или 1,3'
  },

  'page.teacher_test_builder.action.create_test': {
    kk: 'Тест жасау',
    ru: 'Создать тест'
  },
  'page.teacher_test_builder.action.save_test': {
    kk: 'Тестті сақтау',
    ru: 'Сохранить тест'
  },
  'page.teacher_test_builder.action.add_question': {
    kk: 'Сұрақ қосу',
    ru: 'Добавить вопрос'
  },
  'page.teacher_test_builder.action.save_question': {
    kk: 'Сұрақты сақтау',
    ru: 'Сохранить вопрос'
  },
  'page.teacher_test_builder.action.clear_form': {
    kk: 'Тазалау',
    ru: 'Очистить'
  },
  'page.teacher_test_builder.action.saving': {
    kk: 'Сақталуда...',
    ru: 'Сохранение...'
  },

  'page.teacher_test_builder.empty.tests_title': {
    kk: 'Тесттер әлі жоқ',
    ru: 'Тестов пока нет'
  },
  'page.teacher_test_builder.empty.tests_text': {
    kk: 'Алғашқы тестті құрғаннан кейін ол осы жерде көрінеді.',
    ru: 'После создания первого теста он появится здесь.'
  },
  'page.teacher_test_builder.empty.select_test_title': {
    kk: 'Тест таңдаңыз',
    ru: 'Выберите тест'
  },
  'page.teacher_test_builder.empty.select_test_text': {
    kk: 'Редакциялауды жалғастыру үшін сол жақ тізімнен тестті таңдаңыз.',
    ru: 'Чтобы продолжить редактирование, выберите тест из списка слева.'
  },
  'page.teacher_test_builder.empty.questions_title': {
    kk: 'Сұрақтар әлі жоқ',
    ru: 'Вопросов пока нет'
  },
  'page.teacher_test_builder.empty.questions_text': {
    kk: 'Алғашқы сұрақты қосқаннан кейін ол осы жерде көрінеді.',
    ru: 'После добавления первого вопроса он появится здесь.'
  },

  'page.teacher_test_builder.loading.tests': {
    kk: 'Тесттер жүктеліп жатыр...',
    ru: 'Тесты загружаются...'
  },
  'page.teacher_test_builder.loading.test_editor': {
    kk: 'Тест редакторы жүктеліп жатыр...',
    ru: 'Редактор теста загружается...'
  },

  'page.teacher_test_builder.error.tests': {
    kk: 'Тесттерді жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить тесты.'
  },

  'page.teacher_test_builder.toast.create_test_title': {
    kk: 'Тест жасалды',
    ru: 'Тест создан'
  },
  'page.teacher_test_builder.toast.update_test_title': {
    kk: 'Тест жаңартылды',
    ru: 'Тест обновлен'
  },
  'page.teacher_test_builder.toast.add_question_title': {
    kk: 'Сұрақ қосылды',
    ru: 'Вопрос добавлен'
  },
  'page.teacher_test_builder.toast.update_question_title': {
    kk: 'Сұрақ жаңартылды',
    ru: 'Вопрос обновлен'
  },
  'page.teacher_test_builder.toast.error_title': {
    kk: 'Әрекетті орындау мүмкін болмады',
    ru: 'Не удалось выполнить действие'
  },
  'page.teacher_test_builder.toast.error_text': {
    kk: 'Өзгерістерді қайтадан сақтап көріңіз.',
    ru: 'Попробуйте сохранить изменения еще раз.'
  },

  'page.teacher_test_builder.validation.options_min': {
    kk: 'Кемінде екі жауап нұсқасы қажет',
    ru: 'Нужно минимум два варианта ответа'
  },
  'page.teacher_test_builder.validation.correct_answer_required': {
    kk: 'Дұрыс жауап нөмірін көрсетіңіз',
    ru: 'Укажите номер правильного ответа'
  },

  'page.teacher_test_builder.status.under_review': {
    kk: 'Қарауға жіберілген',
    ru: 'Отправлен на проверку'
  },

  'page.teacher_test_builder.question_type.single': {
    kk: 'Бір жауапты сұрақ',
    ru: 'Вопрос с одним ответом'
  },
  'page.teacher_test_builder.question_type.multiple': {
    kk: 'Көп жауапты сұрақ',
    ru: 'Вопрос с несколькими ответами'
  },

  'page.teacher_test_builder.questions_label': {
    kk: 'сұрақ',
    ru: 'вопросов'
  },
  'page.teacher_test_builder.options_label': {
    kk: 'нұсқа',
    ru: 'вариантов'
  },
    'page.admin_dashboard.subtitle': {
    kk: 'Платформадағы контентті, пайдаланушыларды және жалпы көрсеткіштерді осы жерден қадағалаңыз.',
    ru: 'Отсюда отслеживайте контент платформы, пользователей и общие показатели.'
  },
  'page.admin_dashboard.loading': {
    kk: 'Әкімшілік панелі жүктеліп жатыр...',
    ru: 'Панель администратора загружается...'
  },
  'page.admin_dashboard.error': {
    kk: 'Әкімшілік панелінің деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные панели администратора.'
  },

  'page.admin_dashboard.empty.title': {
    kk: 'Мәліметтер әзірге қолжетімді емес',
    ru: 'Данные пока недоступны'
  },
  'page.admin_dashboard.empty.text': {
    kk: 'Жүйе деректері жаңартылғаннан кейін бұл бөлім толтырылады.',
    ru: 'После обновления данных системы этот раздел заполнится.'
  },

  'page.admin_dashboard.moderation_empty.title': {
    kk: 'Қарауды қажет ететін контент жоқ',
    ru: 'Нет контента, ожидающего проверки'
  },
  'page.admin_dashboard.moderation_empty.text': {
    kk: 'Қазір модерацияға жіберілген материалдар жоқ.',
    ru: 'Сейчас нет материалов, отправленных на модерацию.'
  },

  'page.admin_dashboard.subject_stats_title': {
    kk: 'Пәндер бойынша статистика',
    ru: 'Статистика по предметам'
  },
  'page.admin_dashboard.subject_stats_empty.title': {
    kk: 'Пәндер статистикасы әзірге жоқ',
    ru: 'Статистика по предметам пока отсутствует'
  },
  'page.admin_dashboard.subject_stats_empty.text': {
    kk: 'Пәндер бойынша деректер жиналғаннан кейін бұл бөлім жаңартылады.',
    ru: 'После накопления данных по предметам этот раздел обновится.'
  },

  'page.admin_dashboard.table.subject': {
    kk: 'Пән',
    ru: 'Предмет'
  },
  'page.admin_dashboard.table.avg_score': {
    kk: 'Орташа нәтиже',
    ru: 'Средний результат'
  },

  'page.admin_dashboard.content_status_title': {
    kk: 'Контент күйлері',
    ru: 'Статусы контента'
  },

  'page.admin_dashboard.review_status.under_review': {
    kk: 'Қаралуда',
    ru: 'На проверке'
  },
  'page.admin_dashboard.review_label': {
    kk: 'Материал',
    ru: 'Материал'
  },
  'page.admin_dashboard.not_available': {
    kk: 'Белгісіз',
    ru: 'Не указано'
  },
    'page.admin_users.subtitle': {
    kk: 'Бұл бөлімде тіркелген пайдаланушылар мен олардың рөлдері көрсетіледі.',
    ru: 'В этом разделе отображаются зарегистрированные пользователи и их роли.'
  },
  'page.admin_users.loading': {
    kk: 'Қолданушылар жүктеліп жатыр...',
    ru: 'Пользователи загружаются...'
  },
  'page.admin_users.error': {
    kk: 'Қолданушылар тізімін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить список пользователей.'
  },

  'page.admin_users.empty.title': {
    kk: 'Қолданушылар табылмады',
    ru: 'Пользователи не найдены'
  },
  'page.admin_users.empty.text': {
    kk: 'Жаңа пайдаланушылар тіркелгеннен кейін олар осы жерде көрінеді.',
    ru: 'После регистрации новых пользователей они появятся здесь.'
  },

  'page.admin_users.profile_meta': {
    kk: 'Профиль және рөл туралы мәлімет',
    ru: 'Информация о профиле и роли'
  },
  'page.admin_users.unnamed_user': {
    kk: 'Аты көрсетілмеген пайдаланушы',
    ru: 'Пользователь без имени'
  },

  'page.admin_users.field.role': {
    kk: 'Рөл',
    ru: 'Роль'
  },
  'page.admin_users.field.user_id': {
    kk: 'Пайдаланушы ID',
    ru: 'ID пользователя'
  },
  'page.admin_users.field.created_at': {
    kk: 'Тіркелген уақыты',
    ru: 'Дата регистрации'
  },

  'page.admin_users.not_available': {
    kk: 'Көрсетілмеген',
    ru: 'Не указано'
  },
    'page.admin_moderation.title.moderation': {
    kk: 'Модерация және жариялау',
    ru: 'Модерация и публикация'
  },
  'page.admin_moderation.title.tests': {
    kk: 'Тесттерді басқару',
    ru: 'Управление тестами'
  },

  'page.admin_moderation.description.moderation': {
    kk: 'Бұл бөлімде мұғалімдер ұсынған материалдарды қарап, олардың жариялану күйін басқара аласыз.',
    ru: 'В этом разделе можно просматривать материалы, предложенные учителями, и управлять их статусом публикации.'
  },
  'page.admin_moderation.description.tests': {
    kk: 'Бұл бөлімде тесттер тізімі көрсетіледі және олардың жариялану күйін өзгертуге болады.',
    ru: 'В этом разделе отображаются тесты и можно изменять их статус публикации.'
  },

  'page.admin_moderation.loading': {
    kk: 'Модерация тізімі жүктеліп жатыр...',
    ru: 'Список модерации загружается...'
  },
  'page.admin_moderation.error': {
    kk: 'Модерация деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные модерации.'
  },

  'page.admin_moderation.empty.moderation_title': {
    kk: 'Қарауды қажет ететін материалдар жоқ',
    ru: 'Нет материалов, ожидающих проверки'
  },
  'page.admin_moderation.empty.moderation_text': {
    kk: 'Жаңа курс немесе тест модерацияға жіберілгеннен кейін олар осы жерде көрінеді.',
    ru: 'После отправки новых курсов или тестов на модерацию они появятся здесь.'
  },

  'page.admin_moderation.empty.tests_title': {
    kk: 'Тесттер табылмады',
    ru: 'Тесты не найдены'
  },
  'page.admin_moderation.empty.tests_text': {
    kk: 'Жаңа тесттер пайда болғаннан кейін олар осы жерде көрінеді.',
    ru: 'После появления новых тестов они будут отображаться здесь.'
  },

  'page.admin_moderation.current_status': {
    kk: 'Қазіргі күйі',
    ru: 'Текущий статус'
  },
  'page.admin_moderation.status.under_review': {
    kk: 'Қаралуда',
    ru: 'На проверке'
  },

  'page.admin_moderation.toast.status_updated': {
    kk: 'Күйі жаңартылды',
    ru: 'Статус обновлен'
  },
  'page.admin_moderation.toast.error_title': {
    kk: 'Әрекетті орындау мүмкін болмады',
    ru: 'Не удалось выполнить действие'
  },
  'page.admin_moderation.toast.error_text': {
    kk: 'Күйді қайтадан өзгертіп көріңіз.',
    ru: 'Попробуйте изменить статус еще раз.'
  },

  'page.admin_moderation.not_available': {
    kk: 'Көрсетілмеген',
    ru: 'Не указано'
  },
  'page.admin_moderation.no_description': {
    kk: 'Қосымша сипаттама жоқ',
    ru: 'Дополнительное описание отсутствует'
  },
    'page.admin_subjects.title': {
    kk: 'Пәндерді басқару',
    ru: 'Управление предметами'
  },
  'page.admin_subjects.subtitle': {
    kk: 'Бұл бөлімде пәндерді қосып, олардың тізімін ретімен қарап шығуға болады.',
    ru: 'В этом разделе можно добавлять предметы и просматривать их список по порядку.'
  },

  'page.admin_subjects.section.new_subject': {
    kk: 'Жаңа пән',
    ru: 'Новый предмет'
  },
  'page.admin_subjects.section.all_subjects': {
    kk: 'Барлық пәндер',
    ru: 'Все предметы'
  },

  'page.admin_subjects.field.name_kk': {
    kk: 'Қазақша атауы',
    ru: 'Название на казахском'
  },
  'page.admin_subjects.field.name_ru': {
    kk: 'Орысша атауы',
    ru: 'Название на русском'
  },
  'page.admin_subjects.field.slug': {
    kk: 'Slug',
    ru: 'Slug'
  },
  'page.admin_subjects.field.sort_order': {
    kk: 'Реті',
    ru: 'Порядок'
  },

  'page.admin_subjects.placeholder.name_kk': {
    kk: 'Мысалы, Математика',
    ru: 'Например, Математика'
  },
  'page.admin_subjects.placeholder.name_ru': {
    kk: 'Мысалы, Математика',
    ru: 'Например, Математика'
  },
  'page.admin_subjects.placeholder.slug': {
    kk: 'mathematics',
    ru: 'mathematics'
  },

  'page.admin_subjects.action.create': {
    kk: 'Пән қосу',
    ru: 'Добавить предмет'
  },
  'page.admin_subjects.action.saving': {
    kk: 'Сақталуда...',
    ru: 'Сохранение...'
  },

  'page.admin_subjects.loading': {
    kk: 'Пәндер жүктеліп жатыр...',
    ru: 'Предметы загружаются...'
  },
  'page.admin_subjects.error': {
    kk: 'Пәндер тізімін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить список предметов.'
  },

  'page.admin_subjects.empty.title': {
    kk: 'Пәндер әлі жоқ',
    ru: 'Предметов пока нет'
  },
  'page.admin_subjects.empty.text': {
    kk: 'Алғашқы пәнді қосқаннан кейін ол осы жерде көрінеді.',
    ru: 'После добавления первого предмета он появится здесь.'
  },

  'page.admin_subjects.toast.create_title': {
    kk: 'Пән қосылды',
    ru: 'Предмет добавлен'
  },
  'page.admin_subjects.toast.error_title': {
    kk: 'Пәнді қосу мүмкін болмады',
    ru: 'Не удалось добавить предмет'
  },
  'page.admin_subjects.toast.error_text': {
    kk: 'Мәліметтерді қайта тексеріп, тағы бір рет көріңіз.',
    ru: 'Проверьте данные и попробуйте еще раз.'
  },
    'page.admin_cms.title': {
    kk: 'Басқару орталығы',
    ru: 'Центр управления'
  },
  'page.admin_cms.subtitle': {
    kk: 'Бұл бөлім әкімшіге негізгі басқару модульдеріне бір жерден өтуге мүмкіндік береді.',
    ru: 'Этот раздел позволяет администратору переходить к основным модулям управления из одного места.'
  },

  'page.admin_cms.item.subjects': {
    kk: 'Пәндерді қосу және олардың ретін басқару.',
    ru: 'Добавление предметов и управление их порядком.'
  },
  'page.admin_cms.item.courses': {
    kk: 'Курстар тізімін қарап, олардың күйін бақылау.',
    ru: 'Просмотр списка курсов и контроль их статуса.'
  },
  'page.admin_cms.item.lessons': {
    kk: 'Сабақтар құрылымын қарап шығу және басқару.',
    ru: 'Просмотр и управление структурой уроков.'
  },
  'page.admin_cms.item.tests': {
    kk: 'Тесттер тізімін қарап, олардың жариялану күйін басқару.',
    ru: 'Просмотр списка тестов и управление их публикацией.'
  },
  'page.admin_cms.item.moderation': {
    kk: 'Қарауды қажет ететін материалдарды тексеру және жариялау күйін өзгерту.',
    ru: 'Проверка материалов, ожидающих рассмотрения, и изменение их статуса публикации.'
  },
  'page.admin_cms.item.users': {
    kk: 'Пайдаланушылар тізімі мен олардың рөлдерін қарау.',
    ru: 'Просмотр списка пользователей и их ролей.'
  },
    'page.not_found.title': {
    kk: 'Бұл бет табылмады',
    ru: 'Эта страница не найдена'
  },
  'page.not_found.text': {
    kk: 'Сілтеме қате болуы мүмкін немесе бет басқа жерге ауыстырылған.',
    ru: 'Возможно, ссылка неверна или страница была перемещена.'
  },
  'page.not_found.back_home': {
    kk: 'Басты бетке оралу',
    ru: 'Вернуться на главную'
  },
    'page.app.loading': {
    kk: 'Бет жүктеліп жатыр...',
    ru: 'Страница загружается...'
  },
    'page.course_catalog.description.student': {
    kk: 'Курстарды таңдап, оқуды өзіңізге ыңғайлы бағытта бастауға болады.',
    ru: 'Здесь можно выбрать курсы и начать обучение в удобном для себя направлении.'
  },
  'page.course_catalog.description.teacher': {
    kk: 'Бұл бөлімде сіздің курстарыңыз және олардың ағымдағы күйі көрсетіледі.',
    ru: 'В этом разделе отображаются ваши курсы и их текущий статус.'
  },
  'page.course_catalog.description.admin': {
    kk: 'Бұл бөлімде курстар тізімі көрсетіледі және олардың жариялану күйін бақылауға болады.',
    ru: 'В этом разделе отображается список курсов и можно контролировать их статус публикации.'
  },

  'page.course_catalog.loading': {
    kk: 'Курстар жүктеліп жатыр...',
    ru: 'Курсы загружаются...'
  },
  'page.course_catalog.error': {
    kk: 'Курстар тізімін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить список курсов.'
  },

  'page.course_catalog.search_placeholder': {
    kk: 'Курсты немесе мұғалімді іздеу...',
    ru: 'Поиск курса или преподавателя...'
  },

  'page.course_catalog.bookmarks.saved': {
    kk: 'Сақталғандар',
    ru: 'Сохраненные'
  },
  'page.course_catalog.bookmarks.all': {
    kk: 'Барлық курстар',
    ru: 'Все курсы'
  },
  'page.course_catalog.bookmark.add': {
    kk: 'Сақталғандарға қосу',
    ru: 'Добавить в сохраненные'
  },
  'page.course_catalog.bookmark.remove': {
    kk: 'Сақталғандардан алып тастау',
    ru: 'Удалить из сохраненных'
  },

  'page.course_catalog.empty.student_title': {
    kk: 'Курстар әзірге қолжетімді емес',
    ru: 'Курсы пока недоступны'
  },
  'page.course_catalog.empty.student_text': {
    kk: 'Жаңа курстар жарияланғаннан кейін олар осы жерде көрінеді.',
    ru: 'После публикации новых курсов они появятся здесь.'
  },
  'page.course_catalog.empty.teacher_title': {
    kk: 'Курстар әлі жоқ',
    ru: 'Курсов пока нет'
  },
  'page.course_catalog.empty.teacher_text': {
    kk: 'Алғашқы курсты құрғаннан кейін ол осы жерде көрінеді.',
    ru: 'После создания первого курса он появится здесь.'
  },
  'page.course_catalog.empty.admin_title': {
    kk: 'Курстар табылмады',
    ru: 'Курсы не найдены'
  },
  'page.course_catalog.empty.admin_text': {
    kk: 'Курстар қосылғаннан кейін оларды осы бөлімнен бақылауға болады.',
    ru: 'После добавления курсов вы сможете отслеживать их в этом разделе.'
  },

  'page.course_catalog.empty.filtered_title': {
    kk: 'Курс табылмады',
    ru: 'Курсы не найдены'
  },
  'page.course_catalog.empty.filtered_text': {
    kk: 'Іздеу немесе сүзгі шарттарына сәйкес курс табылмады.',
    ru: 'По заданным параметрам поиска или фильтра курсы не найдены.'
  },
  'page.course_catalog.empty.bookmarks_text': {
    kk: 'Сақталған курстарыңыз әзірге жоқ.',
    ru: 'У вас пока нет сохраненных курсов.'
  },

  'page.course_catalog.toast.enroll_success': {
    kk: 'Курсқа тіркелу орындалды',
    ru: 'Запись на курс выполнена'
  },
  'page.course_catalog.toast.bookmark_added': {
    kk: 'Курс сақталғандарға қосылды',
    ru: 'Курс добавлен в сохраненные'
  },
  'page.course_catalog.toast.bookmark_removed': {
    kk: 'Курс сақталғандардан алынды',
    ru: 'Курс удален из сохраненных'
  },
  'page.course_catalog.toast.error_title': {
    kk: 'Әрекетті орындау мүмкін болмады',
    ru: 'Не удалось выполнить действие'
  },
  'page.course_catalog.toast.error_text': {
    kk: 'Қайтадан көріңіз.',
    ru: 'Попробуйте еще раз.'
  },

  'page.course_catalog.enrolling': {
    kk: 'Тіркелуде...',
    ru: 'Запись...'
  },
  'page.course_catalog.current_status': {
    kk: 'Қазіргі күйі',
    ru: 'Текущий статус'
  },
  'page.course_catalog.no_description': {
    kk: 'Сипаттама жоқ',
    ru: 'Описание отсутствует'
  },
    'page.analytics.title.teacher': {
    kk: 'Мұғалім аналитикасы',
    ru: 'Аналитика учителя'
  },
  'page.analytics.title.parent': {
    kk: 'Бала аналитикасы',
    ru: 'Аналитика ребенка'
  },
  'page.analytics.title.admin': {
    kk: 'Аналитика',
    ru: 'Аналитика'
  },

  'page.analytics.description.teacher': {
    kk: 'Оқушылардың курс өту прогресі мен оқу белсенділігі осы бөлімде көрсетіледі.',
    ru: 'В этом разделе отображаются прогресс прохождения курсов учениками и их учебная активность.'
  },
  'page.analytics.description.parent': {
    kk: 'Бұл бөлімде балалардың оқу нәтижелері мен соңғы белсенділігі жинақталып көрсетіледі.',
    ru: 'В этом разделе в сводном виде отображаются результаты обучения детей и их недавняя активность.'
  },
  'page.analytics.description.student': {
    kk: 'Бұл бөлімде сіздің пәндер бойынша нәтижелеріңіз және соңғы белсенділігіңіз көрсетіледі.',
    ru: 'В этом разделе отображаются ваши результаты по предметам и недавняя активность.'
  },
  'page.analytics.description.admin': {
    kk: 'Бұл бөлімде жүйедегі аналитикалық көрсеткіштер көрінеді.',
    ru: 'В этом разделе отображаются аналитические показатели системы.'
  },

  'page.analytics.loading': {
    kk: 'Аналитика жүктеліп жатыр...',
    ru: 'Аналитика загружается...'
  },
  'page.analytics.error': {
    kk: 'Аналитика деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить аналитические данные.'
  },

  'page.analytics.empty.title': {
    kk: 'Аналитика әзірге қолжетімді емес',
    ru: 'Аналитика пока недоступна'
  },
  'page.analytics.empty.text': {
    kk: 'Деректер жиналғаннан кейін бұл бөлімде аналитика көрсетіледі.',
    ru: 'После накопления данных аналитика появится в этом разделе.'
  },

  'page.analytics.avg_course_progress': {
    kk: 'Орташа курс прогресі',
    ru: 'Средний прогресс курса'
  },
  'page.analytics.completed_lessons': {
    kk: 'Аяқталған сабақтар',
    ru: 'Завершенные уроки'
  },
  'page.analytics.average_short': {
    kk: 'Орташа',
    ru: 'Среднее'
  },
  'page.analytics.students_short': {
    kk: 'оқушы',
    ru: 'учеников'
  },
  'page.analytics.tests_short': {
    kk: 'тест',
    ru: 'тестов'
  },

  'page.analytics.teacher.course_progress_title': {
    kk: 'Курстар бойынша прогресс',
    ru: 'Прогресс по курсам'
  },
  'page.analytics.teacher.course_progress_empty.title': {
    kk: 'Курс аналитикасы әзірге жоқ',
    ru: 'Аналитика по курсам пока отсутствует'
  },
  'page.analytics.teacher.course_progress_empty.text': {
    kk: 'Оқушылар курс өткеннен кейін прогресс осы жерде көрінеді.',
    ru: 'После прохождения курсов учениками прогресс появится здесь.'
  },

  'page.analytics.teacher.completion_title': {
    kk: 'Аяқтау көрсеткіші',
    ru: 'Показатель завершения'
  },
  'page.analytics.teacher.completion_empty.title': {
    kk: 'Аяқтау дерегі әзірге жоқ',
    ru: 'Данных о завершении пока нет'
  },
  'page.analytics.teacher.completion_empty.text': {
    kk: 'Оқушылар сабақтарды аяқтаған сайын бұл бөлім жаңартылады.',
    ru: 'По мере завершения уроков учениками этот раздел будет обновляться.'
  },

  'page.analytics.subject_performance_title': {
    kk: 'Пәндік нәтиже',
    ru: 'Результаты по предметам'
  },
  'page.analytics.subject_performance_empty.title': {
    kk: 'Пәндік аналитика әлі жоқ',
    ru: 'Предметная аналитика пока отсутствует'
  },
  'page.analytics.subject_performance_empty.text': {
    kk: 'Нәтижелер пайда болғаннан кейін бұл бөлімде пәндер бойынша көрсеткіштер көрінеді.',
    ru: 'После появления результатов здесь отобразятся показатели по предметам.'
  },

  'page.analytics.recent_activity_empty.title': {
    kk: 'Соңғы белсенділік әлі жоқ',
    ru: 'Недавняя активность пока отсутствует'
  },
  'page.analytics.recent_activity_empty.text': {
    kk: 'Тесттер мен сабақтар аяқталған сайын белсенділік осы жерде көрінеді.',
    ru: 'По мере завершения тестов и уроков активность будет отображаться здесь.'
  },

  'page.analytics.weak_topics_title': {
    kk: 'Назар аудару керек бағыттар',
    ru: 'Зоны, требующие внимания'
  },
  'page.analytics.weak_topics_empty.title': {
    kk: 'Әлсіз бағыттар анықталмады',
    ru: 'Слабые зоны не определены'
  },
  'page.analytics.weak_topics_empty.text': {
    kk: 'Қазіргі деректер бойынша қосымша назар қажет бағыттар табылмады.',
    ru: 'По текущим данным не выявлены направления, требующие дополнительного внимания.'
  },

  'page.analytics.parent_recent_test_action': {
    kk: 'Тест тапсырды',
    ru: 'Прошел тест'
  },
  'page.analytics.parent_attention_count': {
    kk: '{count} балада байқалды',
    ru: 'Наблюдается у {count} детей'
  },

  'page.analytics.not_available': {
    kk: 'Көрсетілмеген',
    ru: 'Не указано'
  },
    'page.leaderboard.my_position_title': {
    kk: 'Менің орным',
    ru: 'Мое место'
  },
  'page.leaderboard.you_label': {
    kk: 'Сіз',
    ru: 'Вы'
  },
    'page.teacher_course_builder.loading': {
    kk: 'Курс редакторы жүктеліп жатыр...',
    ru: 'Редактор курса загружается...'
  },
  'page.teacher_course_builder.error': {
    kk: 'Курс редакторының деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные редактора курса.'
  },

  'page.teacher_course_builder.action.delete_course': {
    kk: 'Курсты өшіру',
    ru: 'Удалить курс'
  },

  'page.teacher_course_builder.confirm.delete_course': {
    kk: 'Осы курсты толық өшіргіңіз келе ме? Онымен байланысты модульдер мен сабақтар да жойылады.',
    ru: 'Вы уверены, что хотите полностью удалить этот курс? Связанные модули и уроки тоже будут удалены.'
  },
  'page.teacher_course_builder.confirm.delete_module': {
    kk: 'Осы модульді өшіргіңіз келе ме? Ішіндегі барлық сабақтар да жойылады.',
    ru: 'Вы уверены, что хотите удалить этот модуль? Все уроки внутри него тоже будут удалены.'
  },
  'page.teacher_course_builder.confirm.delete_lesson': {
    kk: 'Осы сабақты өшіргіңіз келе ме?',
    ru: 'Вы уверены, что хотите удалить этот урок?'
  },

  'page.teacher_course_builder.toast.delete_course_title': {
    kk: 'Курс өшірілді',
    ru: 'Курс удален'
  },
  'page.teacher_course_builder.toast.delete_module_title': {
    kk: 'Модуль өшірілді',
    ru: 'Модуль удален'
  },
  'page.teacher_course_builder.toast.delete_lesson_title': {
    kk: 'Сабақ өшірілді',
    ru: 'Урок удален'
  },
  'page.teacher_course_builder.toast.reorder_modules_title': {
    kk: 'Модульдер реті жаңартылды',
    ru: 'Порядок модулей обновлен'
  },
  'page.teacher_course_builder.toast.reorder_lessons_title': {
    kk: 'Сабақтар реті жаңартылды',
    ru: 'Порядок уроков обновлен'
  },
    'page.teacher_test_builder.action.delete_test': {
    kk: 'Тестті өшіру',
    ru: 'Удалить тест'
  },

  'page.teacher_test_builder.confirm.delete_test': {
    kk: 'Осы тестті толық өшіргіңіз келе ме? Барлық сұрақтар мен нәтижелер де жойылады.',
    ru: 'Вы уверены, что хотите полностью удалить этот тест? Все вопросы и результаты также будут удалены.'
  },
  'page.teacher_test_builder.confirm.delete_question': {
    kk: 'Осы сұрақты өшіргіңіз келе ме?',
    ru: 'Вы уверены, что хотите удалить этот вопрос?'
  },

  'page.teacher_test_builder.toast.delete_test_title': {
    kk: 'Тест өшірілді',
    ru: 'Тест удален'
  },
  'page.teacher_test_builder.toast.delete_question_title': {
    kk: 'Сұрақ өшірілді',
    ru: 'Вопрос удален'
  },
  'page.teacher_test_builder.toast.reorder_questions_title': {
    kk: 'Сұрақтар реті жаңартылды',
    ru: 'Порядок вопросов обновлен'
  },

  'page.teacher_test_builder.validation.correct_answer_range': {
    kk: 'Дұрыс жауап нөмірі жауап нұсқалары шегінде болуы керек',
    ru: 'Номер правильного ответа должен быть в пределах вариантов ответа'
  },
  'page.teacher_test_builder.validation.single_answer_only': {
    kk: 'Бір жауапты сұрақ үшін тек бір дұрыс жауап көрсету керек',
    ru: 'Для вопроса с одним ответом нужно указать только один правильный вариант'
  },
    'auth.login_hint': {
    kk: 'Email мен парольді енгізіңіз',
    ru: 'Введите email и пароль'
  },
  'auth.email_confirmation_required': {
    kk: 'Email-ды растаңыз.',
    ru: 'Подтвердите email.'
  },
  'auth.email_not_confirmed_info': {
    kk: 'Email әлі расталмаған. Поштаңыздағы растау сілтемесін ашып, қайта кіріңіз.',
    ru: 'Email еще не подтвержден. Откройте ссылку подтверждения в почте и войдите снова.'
  },
  'auth.login_failed': {
    kk: 'Кіру сәтсіз аяқталды',
    ru: 'Не удалось войти'
  },
  'auth.show_password': {
    kk: 'Парольді көрсету',
    ru: 'Показать пароль'
  },
  'auth.hide_password': {
    kk: 'Парольді жасыру',
    ru: 'Скрыть пароль'
  },
    'common.unknown': { kk: 'Белгісіз', ru: 'Неизвестно' },
  'common.not_available': { kk: 'Көрсетілмеген', ru: 'Не указано' },
  'common.no_description': { kk: 'Сипаттама жоқ', ru: 'Описание отсутствует' },
  'common.under_review': { kk: 'Қаралуда', ru: 'На проверке' },
  'common.current_status': { kk: 'Қазіргі күйі', ru: 'Текущий статус' },
    'page.lesson_detail.title': {
    kk: 'Сабақ',
    ru: 'Урок'
  },
  'page.lesson_detail.subtitle': {
    kk: 'Теория, медиа және практика осы бетте көрсетіледі.',
    ru: 'На этой странице отображаются теория, медиа и практика.'
  },
  'page.lesson_detail.back_to_lessons': {
    kk: 'Сабақтарға қайту',
    ru: 'Вернуться к урокам'
  },

  'page.lesson_detail.loading': {
    kk: 'Сабақ жүктеліп жатыр...',
    ru: 'Урок загружается...'
  },
  'page.lesson_detail.error': {
    kk: 'Сабақ деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные урока.'
  },

  'page.lesson_detail.locked_title': {
    kk: 'Сабақ құлыптаулы',
    ru: 'Урок заблокирован'
  },
  'page.lesson_detail.locked_text': {
    kk: 'Алдыңғы сабақты аяқтағаннан кейін бұл сабақ ашылады.',
    ru: 'Этот урок откроется после завершения предыдущего.'
  },

  'page.lesson_detail.empty_theory_title': {
    kk: 'Теория бөлімі әзірге бос',
    ru: 'Раздел теории пока пуст'
  },
  'page.lesson_detail.empty_theory_text': {
    kk: 'Бұл сабақтың теориялық бөлігі әлі толықтырылмаған.',
    ru: 'Теоретическая часть этого урока пока не заполнена.'
  },

  'page.lesson_detail.media_title': {
    kk: 'Видео немесе медиа',
    ru: 'Видео или медиа'
  },
  'page.lesson_detail.open_media': {
    kk: 'Медиа сілтемесін ашу',
    ru: 'Открыть медиассылку'
  },

  'page.lesson_detail.practice_title': {
    kk: 'Практика',
    ru: 'Практика'
  },

  'page.lesson_detail.status_title': {
    kk: 'Сабақ статусы',
    ru: 'Статус урока'
  },
  'page.lesson_detail.field.course': {
    kk: 'Курс',
    ru: 'Курс'
  },
  'page.lesson_detail.field.module': {
    kk: 'Модуль',
    ru: 'Модуль'
  },
  'page.lesson_detail.field.subject': {
    kk: 'Пән',
    ru: 'Предмет'
  },
  'page.lesson_detail.field.status': {
    kk: 'Статус',
    ru: 'Статус'
  },

  'page.lesson_detail.status.in_progress': {
    kk: 'Оқылып жатыр',
    ru: 'Изучается'
  },

  'page.lesson_detail.teacher_review_note': {
    kk: 'Бұл көрініс оқу материалын тексеруге арналған. Аяқтау әрекеті тек оқушыға қолжетімді.',
    ru: 'Этот режим предназначен для проверки учебного материала. Завершение доступно только ученику.'
  },

  'page.lesson_detail.empty_content_note': {
    kk: 'Сабақ мазмұны әлі толық толтырылмаған.',
    ru: 'Содержимое урока пока заполнено не полностью.'
  },
    'page.teacher_students.subtitle': {
    kk: 'Бұл бөлімде курстарыңызға тіркелген оқушылар мен олардың оқу прогресі көрсетіледі.',
    ru: 'В этом разделе отображаются ученики, записанные на ваши курсы, и их учебный прогресс.'
  },
  'page.teacher_students.loading': {
    kk: 'Оқушылар статистикасы жүктеліп жатыр...',
    ru: 'Статистика по ученикам загружается...'
  },
  'page.teacher_students.error': {
    kk: 'Оқушылар деректерін жүктеу мүмкін болмады.',
    ru: 'Не удалось загрузить данные учеников.'
  },

  'page.teacher_students.empty.title': {
    kk: 'Оқушылар әзірге тіркелмеген',
    ru: 'Ученики пока не записаны'
  },
  'page.teacher_students.empty.text': {
    kk: 'Курстарыңызға жаңа оқушылар жазылғаннан кейін олар осы жерде көрінеді.',
    ru: 'После записи новых учеников на ваши курсы они появятся здесь.'
  },

  'page.teacher_students.field.progress': {
    kk: 'Прогресс',
    ru: 'Прогресс'
  },
  'page.teacher_students.field.completed_lessons': {
    kk: 'Аяқталған сабақтар',
    ru: 'Завершенные уроки'
  },
  'page.teacher_students.field.enrolled_at': {
    kk: 'Тіркелген күні',
    ru: 'Дата записи'
  },
  'page.teacher_students.field.last_activity': {
    kk: 'Соңғы белсенділік',
    ru: 'Последняя активность'
  },

  'page.teacher_students.not_available': {
    kk: 'Әзірге жоқ',
    ru: 'Пока нет'
  },
    'page.profile.title': {
    kk: 'Профиль баптаулары',
    ru: 'Настройки профиля'
  },
  'page.profile.subtitle': {
    kk: 'Аватарды, атыңызды және өзіңіз туралы қысқаша мәліметті осы жерде жаңарта аласыз.',
    ru: 'Здесь можно обновить аватар, имя и краткую информацию о себе.'
  },

  'page.profile.card_title': {
    kk: 'Пайдаланушы профилі',
    ru: 'Профиль пользователя'
  },
  'page.profile.card_description': {
    kk: 'Өз атыңызды, қысқаша сипаттамаңызды және профиль суретіңізді жаңартыңыз.',
    ru: 'Обновите свое имя, краткое описание и изображение профиля.'
  },

  'page.profile.field.avatar': {
    kk: 'Аватар',
    ru: 'Аватар'
  },
  'page.profile.field.bio': {
    kk: 'Өзі туралы',
    ru: 'О себе'
  },

  'page.profile.avatar_hint': {
    kk: 'PNG, JPG немесе WEBP файлын таңдаңыз. Алдымен суретті қиып, содан кейін ғана сақтайсыз.',
    ru: 'Выберите файл PNG, JPG или WEBP. Сначала изображение будет обрезано, и только потом сохранено.'
  },

  'page.profile.placeholder.bio': {
    kk: 'Өзіңіз туралы қысқаша ақпарат жазыңыз',
    ru: 'Кратко расскажите о себе'
  },

  'page.profile.action.remove_avatar': {
    kk: 'Аватарды өшіру',
    ru: 'Удалить аватар'
  },
  'page.profile.action.removing_avatar': {
    kk: 'Өшірілуде...',
    ru: 'Удаление...'
  },
  'page.profile.action.save_changes': {
    kk: 'Өзгерістерді сақтау',
    ru: 'Сохранить изменения'
  },
  'page.profile.action.saving': {
    kk: 'Сақталуда...',
    ru: 'Сохранение...'
  },

  'page.profile.toast.error_title': {
    kk: 'Әрекетті орындау мүмкін болмады',
    ru: 'Не удалось выполнить действие'
  },
  'page.profile.toast.invalid_file_type': {
    kk: 'Тек сурет файлын таңдаңыз.',
    ru: 'Выберите только файл изображения.'
  },
  'page.profile.toast.file_too_large': {
    kk: 'Сурет көлемі 25 MB-тан аспауы керек.',
    ru: 'Размер изображения не должен превышать 25 МБ.'
  },
  'page.profile.toast.avatar_updated': {
    kk: 'Аватар жаңартылды',
    ru: 'Аватар обновлен'
  },
  'page.profile.toast.avatar_removed': {
    kk: 'Аватар өшірілді',
    ru: 'Аватар удален'
  },
  'page.profile.toast.profile_updated': {
    kk: 'Профиль жаңартылды',
    ru: 'Профиль обновлен'
  },
  'page.profile.toast.avatar_save_error': {
    kk: 'Аватарды сақтау мүмкін болмады.',
    ru: 'Не удалось сохранить аватар.'
  },
  'page.profile.toast.avatar_remove_error': {
    kk: 'Аватарды өшіру мүмкін болмады.',
    ru: 'Не удалось удалить аватар.'
  },
  'page.profile.toast.profile_save_error': {
    kk: 'Профильді сақтау мүмкін болмады.',
    ru: 'Не удалось сохранить профиль.'
  },
    'auth.register_hint': {
    kk: 'Жаңа аккаунт жасаңыз',
    ru: 'Создайте новый аккаунт'
  },
  'auth.full_name_placeholder': {
    kk: 'Аты-жөні',
    ru: 'Имя и фамилия'
  },
  'auth.register_failed': {
    kk: 'Тіркелу сәтсіз аяқталды',
    ru: 'Не удалось зарегистрироваться'
  },
    'landing.platform_badge': {
    kk: 'Білім беру платформасы',
    ru: 'Образовательная платформа'
  },

  'landing.audience.students.point_1': {
    kk: 'Мектеп пәндері бойынша сабақтар',
    ru: 'Уроки по школьным предметам'
  },
  'landing.audience.students.point_2': {
    kk: 'ҰБТ-ға дайындық тесттері',
    ru: 'Тесты для подготовки к ЕНТ'
  },
  'landing.audience.students.point_3': {
    kk: 'Жетістіктер мен рейтинг',
    ru: 'Достижения и рейтинг'
  },

  'landing.audience.teachers.point_1': {
    kk: 'Курс құру құралдары',
    ru: 'Инструменты для создания курсов'
  },
  'landing.audience.teachers.point_2': {
    kk: 'Оқушы үлгерімін бақылау',
    ru: 'Контроль успеваемости учеников'
  },
  'landing.audience.teachers.point_3': {
    kk: 'Тест жинақтарын жасау',
    ru: 'Создание наборов тестов'
  },

  'landing.audience.parents.point_1': {
    kk: 'Бала үлгерімін бақылау',
    ru: 'Контроль успеваемости ребенка'
  },
  'landing.audience.parents.point_2': {
    kk: 'Тест нәтижелерін көру',
    ru: 'Просмотр результатов тестов'
  },
  'landing.audience.parents.point_3': {
    kk: 'Әлсіз пәндерді анықтау',
    ru: 'Определение слабых предметов'
  },

  'landing.cta_title': {
    kk: 'Бүгін бастаңыз',
    ru: 'Начните сегодня'
  },
  'landing.cta_subtitle': {
    kk: 'Тіркеліп, мектеп пәндерін оқып, ҰБТ-ға дайындалыңыз',
    ru: 'Зарегистрируйтесь, изучайте школьные предметы и готовьтесь к ЕНТ'
  },

  'landing.footer_copy': {
    kk: '© 2026 Bilim. Барлық құқықтар қорғалған.',
    ru: '© 2026 Bilim. Все права защищены.'
  },
    'page.about.hero.badge': {
    kk: 'Sana · Research-driven education platform',
    ru: 'Sana · Research-driven education platform'
  },
  'page.about.hero.title': {
    kk: 'Sana — адамды орталыққа қоятын AI-білім архитектурасының іргетасы',
    ru: 'Sana — основа AI-образовательной архитектуры с человеком в центре'
  },
  'page.about.hero.subtitle': {
    kk: 'Бұл толық AI-өнім емес. Қазіргі кезеңде Sana оқу платформасының негізгі құрылымын, рөлдік архитектурасын және педагогикалық негізін құрып жатыр. AI кейін осы негіздің үстіне жауапты қолдау қабаты ретінде енгізіледі.',
    ru: 'Это не полностью готовый AI-продукт. На текущем этапе Sana выстраивает базовую структуру учебной платформы, ролевую архитектуру и педагогический фундамент. AI позже будет добавлен поверх этой основы как ответственный поддерживающий слой.'
  },
  'page.about.hero.cta_primary': {
    kk: 'Жобамен танысу',
    ru: 'Познакомиться с проектом'
  },
  'page.about.hero.cta_secondary': {
    kk: 'Қазіргі нұсқаға кіру',
    ru: 'Перейти к текущей версии'
  },

  'page.about.why.eyebrow': {
    kk: 'Why this project exists',
    ru: 'Why this project exists'
  },
  'page.about.why.title': {
    kk: 'Мақсат — AI-ды білім беруге тез қосу емес, оны дұрыс рөлге қою',
    ru: 'Цель — не просто быстро встроить AI в образование, а определить для него правильную роль'
  },
  'page.about.why.text_1': {
    kk: 'Бүгінгі білім беру өнімдерінің бір бөлігі жай контент жеткізумен шектеледі, ал екінші бөлігі AI-ды шынайы архитектурасыз уәде ретінде ұсынады. Sana осының арасында үшінші жол іздейді: алдымен сенімді оқу платформасын құру, содан кейін ғана AI-ды педагогикалық логикаға бағынған қабат ретінде енгізу.',
    ru: 'Часть современных образовательных продуктов ограничивается доставкой контента, а другая часть предлагает AI как обещание без устойчивой архитектуры. Sana ищет третий путь: сначала построить надежную учебную платформу, и только затем вводить AI как слой, подчиненный педагогической логике.'
  },
  'page.about.why.text_2': {
    kk: 'Жоба көтеретін басты сұрақ: AI білім беруде орталық күш болмауы керек болса, онда ол нақты қандай рөл атқаруы тиіс?',
    ru: 'Ключевой вопрос проекта: если AI не должен быть центральной силой в образовании, то какую именно роль он должен играть?'
  },

  'page.about.questions.question_1.title': {
    kk: 'Research question 01',
    ru: 'Research question 01'
  },
  'page.about.questions.question_1.text': {
    kk: 'Оқу платформасының негізгі архитектурасы AI-ға дейін қалай дұрыс құрылуы керек?',
    ru: 'Как должна быть правильно выстроена базовая архитектура учебной платформы до интеграции AI?'
  },
  'page.about.questions.question_2.title': {
    kk: 'Research question 02',
    ru: 'Research question 02'
  },
  'page.about.questions.question_2.text': {
    kk: 'AI learner autonomy мен teacher judgment-ті әлсіретпей, қалай support layer бола алады?',
    ru: 'Как AI может стать слоем поддержки, не ослабляя автономию ученика и профессиональное суждение учителя?'
  },
  'page.about.questions.question_3.title': {
    kk: 'Research question 03',
    ru: 'Research question 03'
  },
  'page.about.questions.question_3.text': {
    kk: 'Мұндай жүйе қазақ тілдік және жергілікті оқу контексіне сезімтал бола ала ма?',
    ru: 'Может ли такая система быть чувствительной к казахскоязычному и локальному образовательному контексту?'
  },

  'page.about.research.eyebrow': {
    kk: 'Research foundation',
    ru: 'Research foundation'
  },
  'page.about.research.title': {
    kk: 'Өнім ғана емес, бағыт та зерттеуге сүйенуі керек',
    ru: 'Не только продукт, но и направление должно опираться на исследование'
  },
  'page.about.research.principle_1.title': {
    kk: 'Human-centered learning',
    ru: 'Human-centered learning'
  },
  'page.about.research.principle_1.text': {
    kk: 'Жүйенің орталығында технология емес, оқушының оқу процесі, мұғалімнің рөлі және түсінікті оқу тәжірибесі тұрады.',
    ru: 'В центре системы находится не технология, а учебный процесс ученика, роль учителя и понятный образовательный опыт.'
  },
  'page.about.research.principle_2.title': {
    kk: 'Pedagogy before automation',
    ru: 'Pedagogy before automation'
  },
  'page.about.research.principle_2.text': {
    kk: 'Автоматтандыру оқу логикасын алмастырмауы керек. Алдымен құрылым, содан кейін ғана интеллектуалды қабат.',
    ru: 'Автоматизация не должна заменять логику обучения. Сначала структура, затем интеллектуальный слой.'
  },
  'page.about.research.principle_3.title': {
    kk: 'Responsible AI integration',
    ru: 'Responsible AI integration'
  },
  'page.about.research.principle_3.text': {
    kk: 'AI тек түсіндірілетін, бақыланатын және педагогикалық тұрғыдан негізделген қолдау қабаты ретінде енгізілуі керек.',
    ru: 'AI должен внедряться только как объяснимый, контролируемый и педагогически обоснованный слой поддержки.'
  },

  'page.about.current.badge': {
    kk: 'Current platform status',
    ru: 'Current platform status'
  },
  'page.about.current.title': {
    kk: 'Қазір не салынып жатыр',
    ru: 'Что строится сейчас'
  },
  'page.about.current.capability_1': {
    kk: 'Рөлге бөлінген платформа архитектурасы: оқушы, мұғалім, ата-ана, әкімші',
    ru: 'Ролевая архитектура платформы: ученик, учитель, родитель, администратор'
  },
  'page.about.current.capability_2': {
    kk: 'Курс, модуль, сабақ құрылымы',
    ru: 'Структура курсов, модулей и уроков'
  },
  'page.about.current.capability_3': {
    kk: 'Тест және сұрақ инфрақұрылымы',
    ru: 'Инфраструктура тестов и вопросов'
  },
  'page.about.current.capability_4': {
    kk: 'Прогресс, рейтинг және аналитиканың базалық қабаттары',
    ru: 'Базовые слои прогресса, рейтинга и аналитики'
  },
  'page.about.current.capability_5': {
    kk: 'Контент құру, өңдеу және модерация ағындары',
    ru: 'Потоки создания, редактирования и модерации контента'
  },
  'page.about.current.note': {
    kk: 'Бұл кезеңнің негізгі мақсаты — Sana-ты “AI туралы айтатын бет” емес, кейінгі интеллектуалды қабатты көтере алатын шынайы платформа негізіне айналдыру.',
    ru: 'Главная цель этого этапа — превратить Sana не в “страницу об AI”, а в реальную платформенную основу, способную в дальнейшем нести интеллектуальный слой.'
  },

  'page.about.planned.badge': {
    kk: 'Planned AI direction · not yet implemented',
    ru: 'Planned AI direction · not yet implemented'
  },
  'page.about.planned.title': {
    kk: 'Кейінгі AI бағыты',
    ru: 'Будущее AI-направление'
  },
  'page.about.planned.capability_1': {
    kk: 'Бейімделетін оқу навигациясы',
    ru: 'Адаптивная учебная навигация'
  },
  'page.about.planned.capability_2': {
    kk: 'Түсіндірілетін weak-topic analysis',
    ru: 'Объяснимая аналитика слабых тем'
  },
  'page.about.planned.capability_3': {
    kk: 'AI tutor тәрізді қолдау сценарийлері',
    ru: 'Сценарии поддержки в стиле AI tutor'
  },
  'page.about.planned.capability_4': {
    kk: 'Teacher support tooling',
    ru: 'Teacher support tooling'
  },
  'page.about.planned.capability_5': {
    kk: 'Human-in-the-loop feedback and moderation systems',
    ru: 'Human-in-the-loop feedback and moderation systems'
  },
  'page.about.planned.note': {
    kk: 'Бұл функциялар қазір орындалған мүмкіндік ретінде емес, болашақ research және architecture phase ретінде қаралады.',
    ru: 'Эти функции рассматриваются не как уже реализованные возможности, а как будущая исследовательская и архитектурная фаза.'
  },

  'page.about.design.eyebrow': {
    kk: 'Design philosophy',
    ru: 'Design philosophy'
  },
  'page.about.design.title': {
    kk: 'Премиум интерфейс жеткіліксіз. Сенімді құрылым маңыздырақ.',
    ru: 'Премиального интерфейса недостаточно. Надежная структура важнее.'
  },
  'page.about.design.principle_1.title': {
    kk: 'Clarity',
    ru: 'Clarity'
  },
  'page.about.design.principle_1.text': {
    kk: 'Интерфейс интеллектуалды көрінгенімен, пайдаланушы үшін түсініксіз болмауы керек.',
    ru: 'Интерфейс может выглядеть интеллектуально, но он не должен быть непонятным для пользователя.'
  },
  'page.about.design.principle_2.title': {
    kk: 'Structure',
    ru: 'Structure'
  },
  'page.about.design.principle_2.text': {
    kk: 'Оқу жолы бөлшектенбей, нақты кезеңдер мен прогресс логикасына сүйенуі керек.',
    ru: 'Учебный путь должен строиться не фрагментарно, а на ясных этапах и логике прогресса.'
  },
  'page.about.design.principle_3.title': {
    kk: 'Restraint',
    ru: 'Restraint'
  },
  'page.about.design.principle_3.text': {
    kk: 'AI мүмкіндігі бар деп көрсету мен AI шын мәнінде пайдалы болатын жердің арасын нақты ажырату қажет.',
    ru: 'Важно четко различать между заявлением о наличии AI и тем местом, где AI действительно приносит пользу.'
  },

  'page.about.impact.eyebrow': {
    kk: 'Why it matters',
    ru: 'Why it matters'
  },
  'page.about.impact.title': {
    kk: 'AI білім беруде функция емес, ықпал ететін қабат',
    ru: 'AI в образовании — не просто функция, а влияющий слой'
  },
  'page.about.impact.text_1': {
    kk: 'Егер AI оқу платформасына терең енетін болса, ол тек assistant feature болып қалмайды. Ол оқу траекториясына, оқушы дербестігіне, мұғалім шешіміне және сенім архитектурасына әсер етеді.',
    ru: 'Если AI глубоко входит в учебную платформу, он перестает быть просто assistant-функцией. Он начинает влиять на учебную траекторию, автономию ученика, решение учителя и архитектуру доверия.'
  },
  'page.about.impact.text_2': {
    kk: 'Сондықтан Sana үшін мәселе “AI қоса салу” емес, “AI қай жерде, қандай шектеумен, кімнің мүддесіне қызмет етуі керек?” деген сұрақ.',
    ru: 'Поэтому для Sana вопрос не в том, чтобы “добавить AI”, а в том, где именно, с какими ограничениями и в чьих интересах он должен работать.'
  },

  'page.about.creator.title': {
    kk: 'Creator / Portfolio',
    ru: 'Creator / Portfolio'
  },
  'page.about.creator.note': {
    kk: 'Бұл бөлімге өз атыңызды, зерттеу бағытыңызды және не үшін осы тақырыппен жұмыс істеп жатқаныңызды қоясыз. Қазір бұл жер әдейі толтырылатын placeholder ретінде қалдырылды.',
    ru: 'В этот блок вы добавите свое имя, исследовательское направление и объяснение, почему работаете именно с этой темой. Сейчас он намеренно оставлен как заполняемый placeholder.'
  },
  'page.about.creator.project_line': {
    kk: 'Sana — WNK бастамасы аясында дамып жатқан research-driven білім беру бағыты. WNK бұл кезеңде formal company емес, осы жобаны бастаған идеялық және авторлық бағыт ретінде көрсетіледі.',
    ru: 'Sana — это research-driven направление в образовании, развивающееся в рамках инициативы WNK. На данном этапе WNK — не formal company, а идейное и авторское направление, из которого вырос проект.'
  },
  'page.about.creator.footer_note': {
    kk: 'Бұл section жобаны жай marketing page емес, авторлық research + product portfolio ретінде көрсетеді.',
    ru: 'Этот section показывает проект не как обычную marketing page, а как авторское сочетание research и product portfolio.'
  },

  'page.about.roadmap.eyebrow': {
    kk: 'Roadmap',
    ru: 'Roadmap'
  },
  'page.about.roadmap.title': {
    kk: 'Жоба бірден AI-ға емес, кезең-кезеңмен сенімді негізге қарай жүреді',
    ru: 'Проект идет не сразу к AI, а поэтапно к надежному фундаменту'
  },
  'page.about.roadmap.phase_1.title': {
    kk: 'Foundation',
    ru: 'Foundation'
  },
  'page.about.roadmap.phase_1.status': {
    kk: 'Current',
    ru: 'Current'
  },
  'page.about.roadmap.phase_1.text': {
    kk: 'Платформа архитектурасы, рөлдер, курс құрылымы, тест логикасы, контент басқару негізі.',
    ru: 'Архитектура платформы, роли, структура курсов, логика тестов и основа управления контентом.'
  },
  'page.about.roadmap.phase_2.title': {
    kk: 'Structured Learning Layer',
    ru: 'Structured Learning Layer'
  },
  'page.about.roadmap.phase_2.status': {
    kk: 'Building',
    ru: 'Building'
  },
  'page.about.roadmap.phase_2.text': {
    kk: 'Оқу ағындарын, аналитиканы және педагогикалық бақылау механизмдерін күшейту.',
    ru: 'Усиление учебных потоков, аналитики и механизмов педагогического контроля.'
  },
  'page.about.roadmap.phase_3.title': {
    kk: 'Responsible AI Layer',
    ru: 'Responsible AI Layer'
  },
  'page.about.roadmap.phase_3.status': {
    kk: 'Planned',
    ru: 'Planned'
  },
  'page.about.roadmap.phase_3.text': {
    kk: 'AI-ды үстем механизм емес, оқу процесін қолдайтын explainable layer ретінде енгізу.',
    ru: 'Внедрение AI не как доминирующего механизма, а как explainable layer, поддерживающего учебный процесс.'
  },
  'page.about.roadmap.phase_4.title': {
    kk: 'Research Validation',
    ru: 'Research Validation'
  },
  'page.about.roadmap.phase_4.status': {
    kk: 'Research',
    ru: 'Research'
  },
  'page.about.roadmap.phase_4.text': {
    kk: 'Нақты сценарийлер арқылы usability, educational relevance және impact бағыттарын тексеру.',
    ru: 'Проверка usability, educational relevance и impact через реальные сценарии.'
  },

  'page.about.cta.title': {
    kk: 'Sana бүгін толық AI-білім өнімі емес. Бірақ ол сондай жүйеге апаратын салмақты негіз болуды көздейді.',
    ru: 'Сегодня Sana — не полноценный AI-образовательный продукт. Но он стремится стать серьезной основой для такой системы.'
  },
  'page.about.cta.text': {
    kk: 'Бұл жобаның құндылығы дәл осы ашықтықта: қазір не барын, не әлі салынбағанын және не үшін бұл бағыт маңызды екенін жасырмай көрсету.',
    ru: 'Ценность проекта именно в этой открытости: честно показывать, что уже существует, что еще не построено и почему это направление имеет значение.'
  },
  'page.about.cta.primary': {
    kk: 'Жобамен танысу',
    ru: 'Познакомиться с проектом'
  },
  'page.about.cta.secondary': {
    kk: 'Қазіргі нұсқаға кіру',
    ru: 'Перейти к текущей версии'
  },
    'nav.ai_question_builder': {
    kk: 'AI сұрақ құрастыру',
    ru: 'AI конструктор вопросов'
  },
  'nav.ai_exams': {
    kk: 'AI емтихандар',
    ru: 'AI экзамены'
  },
  'nav.ai_practice': {
    kk: 'AI практика',
    ru: 'AI практика'
  },
  'nav.ai_tutor': {
    kk: 'AI тьютор',
    ru: 'AI тьютор'
  },
  'nav.ai_tracker': {
    kk: 'AI Tracker',
    ru: 'AI Tracker'
  },
  'nav.ai_assistant': {
    kk: 'AI көмекші',
    ru: 'AI помощник'
  },
} as const;

export type TranslationKey = keyof typeof translations;

function isLocale(value: string): value is Locale {
  return value === 'kk' || value === 'ru';
}

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return savedLocale && isLocale(savedLocale) ? savedLocale : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: Locale) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage write errors
  }
}

function getInitialLocale(): Locale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

let currentLocale: Locale = getInitialLocale();

export function setLocale(locale: Locale) {
  currentLocale = locale;
  persistLocale(locale);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function hasTranslation(
  key: TranslationKey,
  locale: Locale = currentLocale
): boolean {
  return Boolean(translations[key]?.[locale]);
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, token) => {
    const value = params[token];
    return value === undefined || value === null ? `{${token}}` : String(value);
  });
}

export function t(
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const entry = translations[key];
  const value = entry?.[currentLocale] ?? entry?.[DEFAULT_LOCALE] ?? key;
  return interpolate(value, params);
}

export default t;