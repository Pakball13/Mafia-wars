# Use an official PHP image with Apache
FROM php:8.2-apache

# Install system dependencies and PHP extensions if needed
RUN apt-get update && apt-get install -y \
    libzip-dev \
    && docker-php-ext-install zip

# Copy your application files into the container
COPY . /var/www/html/

# Set the working directory
WORKDIR /var/www/html/

# Ensure the data directory exists and has correct permissions
# Note: The actual data will be on a persistent disk mounted later.
RUN mkdir -p /var/www/html/data && chown -R www-data:www-data /var/www/html/data && chmod -R 755 /var/www/html/data

# Expose port 80 (Render will map this automatically)
EXPOSE 80