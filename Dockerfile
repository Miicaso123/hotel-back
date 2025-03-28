# устанавливаем официальный образ Node.js
FROM node:20.12.1-alpine3.19

# указываем рабочую (корневую) директорию
WORKDIR /app

# копируем основные файлы приложения в рабочую директорию
COPY package.json package-lock.json ./

# устанавливаем указанные зависимости NPM на этапе установки образа
RUN npm install

# после установки копируем все файлы проекта в корневую директорию
COPY . ./

EXPOSE 3000
# запускаем основной скрипт в момент запуска контейнера
CMD npm start