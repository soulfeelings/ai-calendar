Быстрый старт

1.Клонировать репозиторий
```
git clone https://github.com/soulfeelings/ai-calendar
```

2.Создать файл окружения на основе примера
```
cp .env.example .env 
cp backend/app/.env.example backend/app/.env
```

Далее заполните данные
CLIENT_ID, CLIENT_SECRET - Данные которые предоставляет гугл при включении Oauth(За ранее настройте его)

3. Запустите проект

``` 
make run
```