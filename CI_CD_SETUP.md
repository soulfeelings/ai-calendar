# CI/CD Настройка для AI Calendar

Этот документ описывает настройку автоматического развертывания для проекта AI Calendar при изменениях в ветке main.

## Компоненты CI/CD

### 1. GitHub Actions (`.github/workflows/deploy.yml`)
Автоматическое развертывание через GitHub Actions для удаленных серверов.

### 2. Локальный Webhook Сервер (`webhook_server.py`)
Python сервер, который прослушивает webhook'и от GitHub и запускает развертывание.

### 3. Скрипт развертывания (`deploy.sh`)
Bash скрипт, который выполняет git pull, пересборку и перезапуск Docker контейнеров, а также проверку nginx.

### 4. Nginx конфигурация
Интеграция с существующим nginx для проксирования webhook'ов.

## Быстрая настройка

### Шаг 1: Настройка nginx для webhook'ов

Поскольку у вас уже настроен nginx (как указано в DEPLOYMENT.md), нужно добавить конфигурацию для webhook сервера.

Добавьте следующий блок в ваш файл `/etc/nginx/sites-available/ai-calendar` внутри блока `server` для HTTPS:

```nginx
# Webhook endpoint для CI/CD
location /webhook {
    proxy_pass http://127.0.0.1:9000/webhook;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Ограничиваем размер тела запроса для webhook'ов
    client_max_body_size 1M;
    
    # Таймауты для webhook'ов
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    
    # Логирование webhook'ов в отдельный файл
    access_log /var/log/nginx/webhook-access.log;
    error_log /var/log/nginx/webhook-error.log;
    
    # Безопасность - разрешаем только POST запросы
    limit_except POST {
        deny all;
    }
}
```

После добавления конфигурации:
```bash
# Проверьте конфигурацию
sudo nginx -t

# Перезапустите nginx
sudo systemctl reload nginx
```

### Шаг 2: Настройка webhook сервера

1. Установите зависимости (если нужны):
```bash
# Убедитесь, что Python 3 установлен
python3 --version
```

2. Измените секретный ключ в файле `.env.webhook`:
```bash
# Сгенерируйте случайный ключ
openssl rand -hex 32
```

3. Обновите секретный ключ в `.env.webhook`:
```
WEBHOOK_SECRET=ваш_сгенерированный_ключ
```

### Шаг 3: Запуск webhook сервера

#### Вариант A: Ручной запуск
```bash
cd "/media/arman/Local Disk/Projects/AIcalendar/ai-calendar"
python3 webhook_server.py
```

#### Вариант B: Автоматический запуск через systemd
```bash
# Скопируйте сервис
sudo cp webhook.service /etc/systemd/system/ai-calendar-webhook.service

# Обновите пути в сервисе под ваши нужды
sudo nano /etc/systemd/system/ai-calendar-webhook.service

# Перезагрузите systemd и запустите сервис
sudo systemctl daemon-reload
sudo systemctl enable ai-calendar-webhook.service
sudo systemctl start ai-calendar-webhook.service

# Проверьте статус
sudo systemctl status ai-calendar-webhook.service
```

### Шаг 4: Настройка GitHub webhook

1. Перейдите в настройки вашего GitHub репозитория
2. Выберите "Webhooks" → "Add webhook"
3. Заполните поля:
   - **Payload URL**: `http://ваш_ip:9000/webhook`
   - **Content type**: `application/json`
   - **Secret**: тот же ключ, что в `.env.webhook`
   - **Events**: выберите "Just the push event"

### Шаг 5: Настройка прав доступа

```bash
# Убедитесь, что пользователь может запускать Docker без sudo
sudo usermod -aG docker $USER

# Перелогиньтесь или выполните:
newgrp docker

# Проверьте права на исполнение скрипта
chmod +x deploy.sh
```

## Настройка для удаленного сервера (GitHub Actions)

Если вы хотите развертывать на удаленном сервере через GitHub Actions:

1. Добавьте секреты в настройки GitHub репозитория:
   - `HOST`: IP адрес вашего сервера
   - `USERNAME`: имя пользователя для SSH
   - `SSH_KEY`: приватный SSH ключ
   - `PORT`: порт SSH (обычно 22)

2. Обновите путь в `.github/workflows/deploy.yml`:
```yaml
script: |
  cd /media/arman/Local\ Disk/Projects/AIcalendar/ai-calendar
  git pull origin main
  docker-compose down
  docker-compose build --no-cache
  docker-compose up -d
```

## Проверка работы

### Проверка webhook сервера
```bash
# Проверьте, что сервер запущен
netstat -tlnp | grep :9000

# Проверьте логи
tail -f webhook.log
```

### Проверка развертывания
```bash
# Запустите развертывание вручную
./deploy.sh

# Проверьте логи развертывания
tail -f deploy.log
```

### Тест webhook'а
```bash
# Сделайте тестовый коммит в main ветку
git add .
git commit -m "Test CI/CD deployment"
git push origin main

# Проверьте логи webhook сервера
tail -f webhook.log
```

## Мониторинг и логи

- **Webhook логи**: `webhook.log`
- **Развертывание логи**: `deploy.log`
- **Docker логи**: `docker-compose logs`
- **Systemd логи**: `sudo journalctl -u ai-calendar-webhook.service -f`

## Устранение неполадок

### Webhook сервер не запускается
- Проверьте, что порт 9000 свободен: `netstat -tlnp | grep :9000`
- Проверьте права доступа к файлам
- Проверьте логи systemd: `sudo journalctl -u ai-calendar-webhook.service`

### Git pull не работает
- Убедитесь, что у пользователя есть права на чтение репозитория
- Проверьте SSH ключи: `ssh -T git@github.com`
- Убедитесь, что рабочая директория чистая

### Docker контейнеры не запускаются
- Проверьте Docker демон: `sudo systemctl status docker`
- Проверьте права пользователя: `docker ps`
- Проверьте логи: `docker-compose logs`

## Безопасность

- Используйте сильный секретный ключ для webhook'ов
- Ограничьте доступ к порту webhook сервера через firewall
- Регулярно обновляйте зависимости
- Мониторьте логи на предмет подозрительной активности

## Дополнительные возможности

### Уведомления
Добавьте уведомления в Telegram или Slack при успешном/неуспешном развертывании.

### Откат изменений
Сохраняйте образы Docker для возможности быстрого отката.

### Тестирование
Добавьте этап тестирования перед развертыванием.
