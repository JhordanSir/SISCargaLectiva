# Dockerfile del backend de SISCargaLectiva.
# Etapa 1 (build): compila con Maven y corre las pruebas. Etapa 2 (run): solo Java y el jar.
# Construir:  docker build -t siscarga-api .
# Correr:     docker run -p 8080:8080 siscarga-api

# ---------- Etapa 1: compilar ----------
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
# Primero solo el pom: Docker guarda en caché las dependencias si el pom no cambia.
COPY pom.xml .
RUN mvn -q dependency:go-offline
# Luego el código, y se arma target/app.jar (las pruebas corren aquí; si fallan, no hay imagen).
COPY src ./src
RUN mvn -q package

# ---------- Etapa 2: correr ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/app.jar app.jar
# Hora de Perú para las fechas de actualización de los parámetros.
ENV TZ=America/Lima
# Puerto del contenedor (en Dokploy, configurar el dominio hacia este puerto).
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
