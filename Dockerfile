# Use official Node.js runtime as the base image. Choose a slim variant to keep the image small.
FROM node:18-slim

# Install system dependencies required for headless Chrome / Puppeteer. If your
# service does not rely on Puppeteer you can omit these packages.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libnspr4 \
        libnss3 \
        libxss1 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxi6 \
        libxrandr2 \
        xdg-utils \
        libgbm1 \
        libgtk-3-0 \
        chromium \
    && rm -rf /var/lib/apt/lists/*

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
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Define the command to run your service
CMD ["node", "index.js"]