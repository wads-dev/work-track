FROM node:22-alpine
RUN apk add --no-cache openjdk21-jre
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"
RUN npm install --global firebase-tools@15.33.0
WORKDIR /workspace
ENTRYPOINT ["sh", "/input/docker/firebase/start-emulators.sh"]
