# Use official Node.js runtime as the base image. Choose a slim variant to keep the image small.
FROM node:18-slim

# Die Installation eines systemweiten Chromium über apt-get wurde entfernt, um
# den Build zu beschleunigen. Puppeteer lädt seine eigene Version von
# Chromium während `npm install`. Dadurch reduziert sich die Größe des
# Basisimages und die Buildzeit.


# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json and install dependencies
COPY package*.json ./

# Install only production dependencies. Use --omit=dev to speed up install.
RUN npm install --omit=dev

# Copy the rest of the application source code
COPY . .

# Expose the port your service listens on (change if needed)
EXPOSE 3000

# Set environment variables so that Puppeteer does not download its own
# copy of Chromium. Instead we rely on the system-installed binary via
# apt-get. If your project does not use Puppeteer these variables are
# harmless. Should you wish to customise the executable path, adjust
# PUPPETEER_EXECUTABLE_PATH accordingly.
# Nutze Puppeteer mit der eigenen Chromium-Version. Wir setzen keine
# PUPPETEER_SKIP_DOWNLOAD-Variablen, damit während `npm install` die
# benötigte Chromium-Binary heruntergeladen wird.

# Define the command to run your service
CMD ["node", "index.js"]