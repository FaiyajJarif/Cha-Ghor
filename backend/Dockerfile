# =============================================================================
# Cha Ghor backend — container image for Render (and any other Docker host).
# =============================================================================
#
# WHY THIS FILE EXISTS
#
# Render has no native Java runtime. Node, Python, Ruby, Go and Rust get one;
# Java does not. Every Spring Boot deployment on Render goes through Docker, so
# a Dockerfile is not an optional nicety here — it is the only way in.
#
# Two stages, because the build needs a full JDK plus Maven and the finished
# application needs neither. Shipping the build tooling would roughly triple the
# image for no benefit, and a smaller image is a faster cold start — which is
# the thing you feel most on a free instance that sleeps after 15 minutes.
# =============================================================================


# ---------------------------------------------------------------- build stage
# Java 17 because backend/pom.xml says <java.version>17</java.version>.
# CLAUDE.md section 5 says Java 21; the pom is what actually compiles, so 17 is
# what this image uses. Reconcile the two eventually — but change the pom
# first and test, never just bump the base image to match a document.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Copy the descriptor alone first and pre-download dependencies.
#
# Docker caches each layer and invalidates everything after the first file that
# changed. With pom.xml copied separately, editing a .java file reuses the
# cached dependency layer instead of re-downloading the whole Maven universe --
# the difference between a two minute redeploy and a ten minute one.
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src

# -DskipTests, deliberately.
#
# The Selenium suite drives a real browser against a real running server. There
# is no browser in this image and no server yet, so those tests cannot pass here
# and are not meant to. They are run locally with -Pselenium; see MANUAL_TEST.md.
RUN mvn -B clean package -DskipTests


# ----------------------------------------------------------------- run stage
# JRE, not JDK: nothing here compiles.
FROM eclipse-temurin:17-jre
WORKDIR /app

# Glob rather than backend-0.0.1-SNAPSHOT.jar, so a version bump in pom.xml does
# not silently break the image. Spring Boot also leaves a .jar.original beside
# the real one; that does not match *.jar, so exactly one file is copied.
COPY --from=build /app/target/*.jar app.jar

# Do not run as root. If something ever gets remote execution through an upload
# handler, this is the difference between a compromised process and a
# compromised container.
RUN useradd -r -u 1001 chaghor
USER chaghor

# Documentation only -- Render ignores EXPOSE and routes to $PORT.
EXPOSE 8080

# =============================================================================
# THE TWO FLAGS THAT MATTER
# =============================================================================
#
# --server.port=${PORT:-8080}
#   Render assigns a port at runtime and puts it in $PORT, then health-checks
#   that port. application.yaml hard-codes 8080, so without this override the
#   app listens on 8080, Render probes something else, gets nothing, and marks
#   the deploy failed -- with a log that says "Started ChaghorApplication" and
#   gives no hint why. The :-8080 fallback keeps `docker run` working locally.
#
# -Xmx400m
#   The free instance has 512 MB. A JVM left to size its own heap reads the
#   host's memory, not the container's limit, and helps itself to far more than
#   it is allowed -- then the kernel OOM-kills it mid-request. That failure
#   looks like a random 502, not like a memory problem.
#
# NOTE THE `exec`. A shell is needed at all only because ${PORT} has to be
# expanded at runtime -- the JSON-array form does no variable substitution, so
# a bare ["java", "...${PORT}..."] would pass the literal string to the JVM.
#
# But `sh -c "java ..."` leaves the SHELL as PID 1, and it does not forward
# signals. Render's SIGTERM on every redeploy would go to the shell, the JVM
# would never hear it, and the container would be SIGKILLed 30 seconds later --
# mid-transaction, with no graceful shutdown. `exec` replaces the shell with the
# JVM, so java becomes PID 1 and receives the signal itself.
ENTRYPOINT ["sh", "-c", "exec java -Xmx400m -jar app.jar --server.port=${PORT:-8080}"]
