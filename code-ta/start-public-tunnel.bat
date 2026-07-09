@echo off
echo 🚀 Starting public tunnel for your project...
echo.
echo 📋 Your local URLs:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000
echo.
echo 🌐 Creating public tunnel...
echo    Frontend tunnel: ssh -R 80:localhost:3000 serveo.net
echo    Backend tunnel:  ssh -R 80:localhost:5000 serveo.net
echo.
echo ✅ Configuration updated:
echo    - All API calls now use relative URLs (/api)
echo    - Vite proxy forwards /api to backend
echo    - serveo.net domains allowed
echo.
echo 🔗 Your public URL will be shown above!
echo    The frontend will automatically proxy API calls to the backend.
echo.
ssh -R 80:localhost:3000 serveo.net
pause
