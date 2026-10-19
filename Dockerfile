# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Spring Boot backend
FROM eclipse-temurin:21-jdk AS backend-build
WORKDIR /app
COPY backend/demo/ ./
COPY --from=frontend-build /frontend/dist ./src/main/resources/static
RUN chmod +x gradlew && ./gradlew bootJar --no-daemon

# Stage 3: Run the application
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=backend-build /app/build/libs/*.jar app.jar
EXPOSE 10000
CMD ["sh", "-c", "java -Dserver.port=${PORT:-10000} -jar app.jar"]
