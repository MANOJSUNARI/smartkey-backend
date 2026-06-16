Smart Key - Cloud-Based Smart Door Access Control System
A full-stack IoT smart door lock system built with React Native, Node.js, PostgreSQL, and Arduino UNO R4 WiFi
For the frontend repository visit: https://github.com/MANOJSUNARI/smartkey-backendhttps://github.com/MANOJSUNARI/smartkey-frontend
________________________________________
Download Android APK
Download and install the APK on any Android device (Android 6.0 or higher):
https://github.com/MANOJSUNARI/smartkey-backend/releases/download/v1.0.0/application-a0aabd89-ffc3-481f-9219-73698aaa0877.apk
Note: An Arduino UNO R4 WiFi connected to a 12V solenoid door lock is required to physically control the door. Without the hardware, you can still register accounts, manage doors, and test the access request workflow.
________________________________________
Live Backend
https://smartkey-backend.onrender.com/api
________________________________________
Features
•	User Authentication - Register, login, JWT sessions, password reset via SendGrid
•	Door Registration - Register doors with bcrypt-hashed passwords
•	Role-Based Access Control - Owner and approved user roles
•	Access Request Workflow - Request, approve, and reject door access
•	Remote Door Control - Open and close doors from anywhere in the world
•	Hardware Confirmation - App only shows success after Arduino physically acts
•	Door Not Connected Detection - 10 second timeout with database state reset
•	Activity Logs - Full history of all door open and close actions
•	Account Management - Sign out and delete account with cascade delete
________________________________________
System Architecture
Mobile App (React Native / Expo)
         |
         | HTTPS REST API
         v
Backend API (Node.js / Express) on Render
         |
         | SQL queries
         v
PostgreSQL Database on Neon
         ^
         | HTTPS polling every 100ms
         |
Arduino UNO R4 WiFi
         |
         | Relay (pin 7)
         v
12V Solenoid Door Lock
________________________________________
Tech Stack
Layer	Technology
Mobile App	React Native, Expo SDK 54
Navigation	React Navigation Stack

HTTP Client	Axios
Backend	Node.js 18, Express 4
Database	PostgreSQL on Neon
Authentication	JWT (7-day expiry), bcrypt work factor 10
Email	SendGrid HTTPS API
Hosting	Render free tier
Hardware	Arduino UNO R4 WiFi, 5V Relay, 12V Solenoid
Build	Expo EAS Build
________________________________________
Database Schema
Table	Purpose
users	User accounts with bcrypt-hashed passwords and reset tokens
doors	Registered doors with is_open and arduino_confirmed flags
door_access_requests	Pending, approved, and rejected access requests
door_access	Active access grants
door_logs	Timestamped open and close activity logs
________________________________________
Hardware Setup
Components needed:
•	Arduino UNO R4 WiFi
•	5V Relay Module
•	12V Solenoid Door Lock
•	12V Power Supply
Wiring:
Arduino Pin 7  -->  Relay IN
Relay COM      -->  12V Power Supply positive
Relay NO       -->  Solenoid positive
Solenoid       -->  12V Power Supply negative
Arduino Libraries to install via Library Manager:
•	WiFiS3
•	ArduinoHttpClient
•	ArduinoJson
Configure your WiFi in the Arduino code:
const char* WIFI_SSID     = "WiFiName";   // Must be 2.4GHz
const char* WIFI_PASSWORD = "WiFiPassword";
const int   DOOR_ID       = 1;                 // door ID have to match the database
Important: Arduino UNO R4 WiFi only supports 2.4GHz networks. 5GHz will not work.
________________________________________
Backend Setup
1.	Clone the repository
2.	git clone https://github.com/MANOJSUNARI/smartkey-backend.git
3.	cd smartkey-backend
4.	Install dependencies
5.	npm install
6.	Create a .env file(I used my  info details)
PORT=5000
DATABASE_URL=your_neon_postgresql_connection_string
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email@gmail.com
SENDGRID_API_KEY=your_sendgrid_api_key
RESET_URL=https://your-backend-url/reset-password
4.	Run locally
npm run dev
________________________________________
Frontend Setup
cd frontend
npm install
npx expo start
Update frontend/src/api/index.js with your backend URL.
________________________________________
API Endpoints
Authentication /api/auth
Method	Endpoint	Auth	Purpose
POST	/auth/register	Public	Register new user
POST	/auth/login	Public	Login and get JWT
POST	/auth/forgot-password	Public	Send reset email
POST	/auth/reset-password	Public	Reset password
DELETE	/auth/delete-account	JWT	Delete account
Doors /api/doors
Method	Endpoint	Auth	Purpose
POST	/doors/register	JWT	Register new door
GET	/doors/status/:id	Public	Arduino polls this
POST	/doors/confirm/:id	Public	Arduino confirms action
GET	/doors/confirmed/:id	Public	App polls for confirmation
POST	/doors/open	JWT	Open door
POST	/doors/close	JWT	Close door
GET	/doors/my-doors	JWT	List owned doors
PUT	/doors/requests/:id/approve	JWT	Approve access request
PUT	/doors/requests/:id/reject	JWT	Reject access request
DELETE	/doors/:id	JWT	Delete door
________________________________________
Known Limitations
•	Arduino WiFi credentials are hardcoded. Changing networks requires re-uploading firmware
•	Render free tier has 30 to 60 second cold start after 15 minutes of inactivity
•	Only supports Android APK. iOS requires Apple Developer Account at 99 pounds per year
•	No automatic door ID pairing. Must be set manually in firmware
________________________________________
Author
Manoj Sunari Student ID: 230257153 
Supervisor: Theocharis Kyriacou
________________________________________
Licence
This project was developed for academic purposes as part of a university dissertation.

