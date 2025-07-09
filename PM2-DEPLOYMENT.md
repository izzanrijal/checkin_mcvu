# PM2 Deployment Guide for BOLT-SCANNER

## Setup

1. Install PM2 globally if not already installed:
   ```
   npm install -g pm2
   ```

2. Start the application using PM2:
   ```
   pm2 start ecosystem.cjs
   ```

3. Save the PM2 process list to ensure it restarts on server reboot:
   ```
   pm2 save
   ```

4. Set up PM2 to start on system boot:
   ```
   pm2 startup
   ```

## Manual GitHub CI/CD Workflow

### Initial Deployment

1. Clone the repository:
   ```
   git clone <repository-url>
   cd BOLT-SCANNER
   ```

2. Install dependencies and build:
   ```
   npm install
   npm run build
   ```

3. Start with PM2:
   ```
   pm2 start ecosystem.cjs
   ```

### Updating Deployment (Post-Pull)

When you want to update your deployment with the latest changes from GitHub:

1. Pull the latest changes:
   ```
   git pull origin main
   ```

2. Use PM2's built-in post-pull deployment:
   ```
   pm2 reload ecosystem.cjs
   ```

   This will automatically:
   - Install dependencies (`npm install`)
   - Build the application (`npm run build`)
   - Restart the PM2 process

### Rolling Back to Previous Commit

If you need to revert to a previous commit:

1. Use the provided revert script:
   ```
   pm2 exec pm2-scripts/revert.bat -- 1
   ```

   Where `1` is the number of commits to roll back (default is 1 if not specified).

2. This will:
   - Reset the repository to the specified previous commit
   - Install dependencies
   - Rebuild the application
   - Restart the PM2 process

## Monitoring

- View logs:
  ```
  pm2 logs bolt-scanner
  ```

- Monitor application:
  ```
  pm2 monit
  ```

- View status:
  ```
  pm2 status
  ```

## Additional Commands

- Restart application:
  ```
  pm2 restart bolt-scanner
  ```

- Stop application:
  ```
  pm2 stop bolt-scanner
  ```

- Delete application from PM2:
  ```
  pm2 delete bolt-scanner
  ```
