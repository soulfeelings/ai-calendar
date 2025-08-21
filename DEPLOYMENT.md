# AI Calendar - Руководство по деплою

Этот документ содержит пошаговые инструкции по развертыванию полного стека AI Calendar (фронтенд + бэкенд) на производственном сервере.

## 📋 Содержание

- [Системные требования](#системные-требования)
- [Подготовка сервера](#подготовка-сервера)
- [Настройка переменных окружения](#настройка-переменных-окружения)
- [Деплой через Docker Compose](#деплой-через-docker-compose)
- [Настройка Nginx (опционально)](#настройка-nginx)
- [SSL сертификаты](#ssl-сертификаты)
- [Мониторинг и логи](#мониторинг-и-логи)
- [Обновление приложения](#обновление-приложения)
- [Бэкап данных](#бэкап-данных)

## 🖥️ Системные требования

### Минимальные требования:
- **ОС**: Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **RAM**: 4GB (рекомендуется 8GB+)
- **CPU**: 2 ядра (рекомендуется 4+)
- **Диск**: 30GB свободного места
- **Порты**: 80, 443, 3000, 8000, 27017, 6379

### Необходимое ПО:
- Docker Engine 20.10+
- Docker Compose 2.0+
- Git
- Nginx (для проксирования)
- Node.js 18+ (для локальной разработки)

## 🚀 Подготовка сервера

### 1. Обновление системы
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. Установка Docker
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Перезайдите в систему или выполните:
newgrp docker

# Проверка установки
docker --version
docker-compose --version
```

### 3. Установка Git
```bash
# Ubuntu/Debian
sudo apt install git -y

# CentOS/RHEL
sudo yum install git -y
```

### 4. Клонирование репозитория
```bash
cd /opt
sudo git clone https://github.com/your-username/ai-calendar.git
sudo chown -R $USER:$USER ai-calendar
cd ai-calendar
```

## 🔐 Настройка переменных окружения

### 1. Создание основного .env файла
```bash
cp .env.example .env
nano .env
```

Содержимое `.env`:
```env
# MongoDB настройки
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=your_strong_password_here
MONGO_HOST=mongodb
MONGO_PORT=27017
MONGO_DB=ai_calendar
MONGO_USERNAME=admin
MONGO_PASSWORD=your_strong_password_here

# Redis настройки
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here

# JWT настройки
JWT_SECRET_KEY=your_super_secret_jwt_key_here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# Google OAuth настройки
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

# OpenAI настройки
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4

# Настройки приложения
APP_ENV=production
DEBUG=false
HOST=0.0.0.0
PORT=8000

# Celery настройки
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
```

### 2. Создание .env для бэкенда
```bash
cp backend/app/.env.example backend/app/.env
nano backend/app/.env
```

Содержимое `backend/app/.env` (дублирует основные настройки):
```env
# Те же переменные, что и в основном .env файле
```

## 🐳 Деплой через Docker Compose

### 1. Создание production docker-compose файла
Создайте `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7.0
    container_name: ai-calendar-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    volumes:
      - mongodb_data:/data/db
      - ./backups:/backups
    networks:
      - ai-calendar-network
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

  redis:
    image: redis:7.2-alpine
    container_name: ai-calendar-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - ai-calendar-network
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ai-calendar-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - UVICORN_RELOAD=false
      - UVICORN_WORKERS=4
    depends_on:
      - mongodb
      - redis
    networks:
      - ai-calendar-network
    volumes:
      - ./logs:/app/logs
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ai-calendar-celery-worker
    restart: unless-stopped
    command: poetry run python celery_worker.py
    env_file:
      - .env
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./logs:/app/logs
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

  celery-flower:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ai-calendar-flower
    restart: unless-stopped
    command: poetry run celery -A celery_app flower --port=5555
    ports:
      - "5555:5555"
    env_file:
      - .env
    depends_on:
      - redis


  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: ai-calendar-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - backend
    networks:
      - ai-calendar-network
    volumes:
      - ./logs:/app/logs
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"

volumes:
  mongodb_data:
    driver: local
  redis_data:
    driver: local

```

### 2. Запуск приложения
```bash
# Создание необходимых директорий
mkdir -p logs backups

# Сборка и запуск в production режиме
docker-compose -f docker-compose.prod.yml up -d --build

# Проверка статуса контейнеров
docker-compose -f docker-compose.prod.yml ps

# Просмотр логов
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
```

## 🌐 Настройка Nginx

### 1. Установка Nginx
```bash
# Ubuntu/Debian
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# Запуск и автозагрузка
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2. Создание конфигурации
Создайте файл `/etc/nginx/sites-available/ai-calendar`:

```nginx
server {
    listen 80;
    server_name ai-calendar.ai-ia.tech;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai-calendar.ai-ia.tech;

    # SSL настройки
    ssl_certificate /etc/letsencrypt/live/ai-calendar.ai-ia.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai-calendar.ai-ia.tech/privkey.pem;
    
    # Критические настройки для решения проблемы с key share
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ecdh_curve X25519:prime256v1:secp384r1;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Дополнительные SSL настройки для улучшения безопасности
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Корневая директория со статическими файлами
    root /usr/share/nginx/html;
    index index.html;

    # Основное location
    location / {
        proxy_pass http://127.0.0.1:3000;  # Прокси на фронтенд-контейнер
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Для SPA приложений может потребоваться обработка HTML5 History API
        proxy_intercept_errors on;
        error_page 404 = /index.html;
    }

    # API бэкенда
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS заголовки
        add_header Access-Control-Allow-Origin "$http_origin" always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With, Origin" always;
        add_header Access-Control-Max-Age "3600" always;

        # Обработка preflight запросов
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "$http_origin";
            add_header Access-Control-Allow-Credentials "true";
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH";
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With, Origin";
            add_header Access-Control-Max-Age "3600";
            add_header Content-Length 0;
            add_header Content-Type text/plain;
            return 204;
        }

        # Таймауты для API
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Буферизация
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # Flower (мониторинг Celery)
    location /flower/ {
        proxy_pass http://127.0.0.1:5555/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Базовая аутентификация
        auth_basic "Flower Monitoring";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }

    # Документация API (если используется Swagger/OpenAPI)
    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
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


    # Health check endpoints
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }

    # Блокирование доступа к системным файлам
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ ~$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Логи
    access_log /var/log/nginx/ai-calendar-access.log;
    error_log /var/log/nginx/ai-calendar-error.log;

    # Безопасность
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self';" always;

    # Ограничения по размеру
    client_max_body_size 10M;
    client_body_buffer_size 128k;

    # Общие настройки производительности
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
}
```

### 3. Активация конфигурации
```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/ai-calendar /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl restart nginx
```

## 🔒 SSL сертификаты

### Вариант 1: Let's Encrypt (бесплатно)
```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получение сертификата
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Автообновление
sudo crontab -e
# Добавьте строку:
0 12 * * * /usr/bin/certbot renew --quiet
```

### Вариант 2: Самоподписанный сертификат (для тестирования)
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/yourdomain.com.key \
    -out /etc/ssl/certs/yourdomain.com.crt
```

## 📊 Мониторинг и логи

### 1. Просмотр логов
```bash
# Логи контейнеров
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f celery-worker

# Логи Nginx
sudo tail -f /var/log/nginx/ai-calendar-access.log
sudo tail -f /var/log/nginx/ai-calendar-error.log

# Системные логи
sudo journalctl -u docker -f
```

### 2. Мониторинг ресурсов
```bash
# Использование ресурсов контейнерами
docker stats

# Состояние дисков
df -h

# Память и CPU
htop
```

### 3. Flower (мониторинг Celery)
Доступ через: `https://yourdomain.com/flower/`

### 4. Создание скрипта мониторинга
Создайте `monitor.sh`:
```bash
#!/bin/bash
echo "=== AI Calendar Health Check ==="
echo "Date: $(date)"
echo ""

echo "Container Status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "Backend Health:"
curl -s http://localhost:8000/health || echo "Backend is down!"

echo ""
echo "Frontend Health:"
curl -s http://localhost:3000 | grep -q "<!DOCTYPE html>" && echo "Frontend is running" || echo "Frontend is down!"

echo ""
echo "MongoDB Status:"
docker exec ai-calendar-mongodb mongosh --eval "db.adminCommand('ping')" --quiet

echo ""
echo "Redis Status:"
docker exec ai-calendar-redis redis-cli ping

echo ""
echo "Disk Usage:"
df -h /opt/ai-calendar

echo "=== End Health Check ==="
```

## 🔄 Обновление приложения

### 1. Создание скрипта обновления
Создайте `update.sh`:
```bash
#!/bin/bash
set -e

echo "Starting AI Calendar update..."

# Создание бэкапа
echo "Creating backup..."
./backup.sh

# Остановка контейнеров
echo "Stopping containers..."
docker-compose -f docker-compose.prod.yml down

# Обновление кода
echo "Updating code..."
git pull origin main

# Сборка и запуск
echo "Building and starting containers..."
docker-compose -f docker-compose.prod.yml up -d --build

# Проверка статуса
echo "Checking status..."
sleep 30
docker-compose -f docker-compose.prod.yml ps

echo "Update completed!"
```

### 2. Применение обновления
```bash
chmod +x update.sh
./update.sh
```

## 💾 Бэкап данных

### 1. Создание скрипта бэкапа
Создайте `backup.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/ai-calendar/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "Starting backup process..."

# Создание директории для бэкапов
mkdir -p $BACKUP_DIR

# Бэкап MongoDB
echo "Backing up MongoDB..."
docker exec ai-calendar-mongodb mongodump --out /backups/mongodb_$DATE

# Бэкап Redis (опционально)
echo "Backing up Redis..."
docker exec ai-calendar-redis redis-cli --rdb /data/dump_$DATE.rdb

# Архивирование
echo "Creating archive..."
cd $BACKUP_DIR
tar -czf ai_calendar_backup_$DATE.tar.gz mongodb_$DATE

# Удаление старых бэкапов (старше 7 дней)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: ai_calendar_backup_$DATE.tar.gz"
```

### 2. Автоматический бэкап
```bash
# Добавьте в crontab
crontab -e

# Ежедневный бэкап в 2:00
0 2 * * * /opt/ai-calendar/backup.sh >> /var/log/ai-calendar-backup.log 2>&1
```

## 🔧 Полезные команды

### Управление контейнерами
```bash
# Перезапуск всех сервисов
docker-compose -f docker-compose.prod.yml restart

# Перезапуск конкретного сервиса
docker-compose -f docker-compose.prod.yml restart backend

# Масштабирование Celery воркеров
docker-compose -f docker-compose.prod.yml up -d --scale celery-worker=3

# Вход в контейнер
docker exec -it ai-calendar-backend bash
```

### Очистка системы
```bash
# Удаление неиспользуемых образов
docker system prune -f

# Очистка логов Docker
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log
```

## 🚨 Решение проблем

### Проблема: Контейнер не запускается
```bash
# Проверка логов
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend

# Проверка переменных окружения
docker-compose -f docker-compose.prod.yml config
```

### Проблема: База данных недоступна
```bash
# Проверка подключения к MongoDB
docker exec -it ai-calendar-mongodb mongosh

# Проверка подключения к Redis
docker exec -it ai-calendar-redis redis-cli ping
```

### Проблема: Фронтенд недоступен или показывает ошибки
```bash
# Проверка статуса контейнера фронтенда
docker-compose -f docker-compose.prod.yml ps frontend

# Проверка логов фронтенда
docker-compose -f docker-compose.prod.yml logs frontend

# Проверка доступности порта
netstat -tulpn | grep :3000

# Перезапуск только фронтенда
docker-compose -f docker-compose.prod.yml restart frontend
```

### Проблема: CORS ошибки между фронтендом и API
```bash
# Проверка конфигурации Nginx
sudo nginx -t

# Проверка CORS заголовков
curl -I -X OPTIONS http://localhost:8000/api/health

# Перезапуск Nginx
sudo systemctl restart nginx
```

### Проблема: API недоступен из фронтенда
```bash
# Проверка маршрутизации в Nginx
sudo tail -f /var/log/nginx/ai-calendar-error.log

# Тест прямого обращения к API
curl http://localhost:8000/health

# Проверка связи между контейнерами
docker exec ai-calendar-frontend ping backend
```

### Проблема: Высокое потребление ресурсов
```bash
# Анализ использования
docker stats
htop

# Ограничение ресурсов в docker-compose.prod.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
  frontend:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.3'
```

### Проблема: Медленная загрузка фронтенда
```bash
# Очистка кэша браузера и проверка сжатия в Nginx
# Добавьте в конфигурацию Nginx:
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/javascript
    application/xml+rss
    application/json;
```
