# Stage 1: React console
FROM node:20-alpine AS react-build
WORKDIR /build
COPY frontend/react-app/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/react-app/ ./
RUN npm run build

# Stage 2: Vue camera/pick panel
FROM node:20-alpine AS vue-build
WORKDIR /build
COPY frontend/vue-panel/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/vue-panel/ ./
RUN npm run build

# Stage 3: serve only built output, URDF/meshes and config
FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=react-build /build/dist /usr/share/nginx/html
COPY --from=vue-build /build/dist /usr/share/nginx/html/vue
COPY backend/urdf/ /usr/share/nginx/html/urdf/
COPY config/cell.yaml /usr/share/nginx/html/config/cell.yaml