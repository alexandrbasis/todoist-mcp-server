# Todoist MCP Server - Production Docker Image
# Optimized for Railway deployment

FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install --ignore-scripts && npm run build

# Set environment variables for HTTP transport mode
ENV TRANSPORT_MODE=http
ENV PORT=8000

# Expose port for Railway (Railway auto-assigns PORT env var)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8000/health || exit 1

# Run the server
CMD ["node", "dist/index.js"]
