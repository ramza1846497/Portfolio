FROM nginx
COPY index.html /usr/share/nginx/html/index.html
COPY game.html /usr/share/nginx/html/game.html
COPY textures /usr/share/nginx/html/textures
