# Poll App

A real-time polling application built with Express.js, Socket.IO, and SQLite.

## Features

- Create new polls with multiple options
- Real-time voting with Socket.IO
- Vote tracking with browser fingerprinting
- Rate limiting to prevent abuse
- Responsive web interface
- SQLite database for persistent storage

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation & Setup

1. **Clone or navigate to the project directory:**
   ```bash
   cd poll-app/server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

## Running the Application

Start the server with:
```bash
npm run start
```

The server will start and display:
```
✓ Server running at http://localhost:3000
```

Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
poll-app/
├── server/
│   ├── src/
│   │   ├── index.js      - Main server file with Express & Socket.IO setup
│   │   └── db.js         - SQLite database initialization
│   ├── public/
│   │   ├── index.html    - Home page (list of polls)
│   │   ├── create.js     - Poll creation logic
│   │   ├── poll.html     - Voting interface
│   │   └── poll.js       - Poll voting logic
│   ├── package.json      - Dependencies and scripts
│   ├── Dockerfile        - Docker configuration
│   └── data.sqlite       - Database file (auto-created)
└── README.md             - This file
```

## API Endpoints

- `GET /` - Serve home page
- `POST /polls` - Create a new poll
- `GET /polls` - Get all polls
- `GET /polls/:id` - Get specific poll
- `POST /polls/:id/vote` - Vote on a poll option

## Technologies Used

- **Backend:** Node.js, Express.js
- **Real-time Communication:** Socket.IO
- **Database:** SQLite3
- **Rate Limiting:** express-rate-limit
- **Frontend:** HTML, CSS, JavaScript

## Features in Detail

### Poll Creation
- Create polls with a question and multiple options
- Rate limited to prevent abuse (10 requests per minute)

### Voting
- Vote on poll options
- Real-time results updates via Socket.IO
- Browser fingerprinting to track voters
- Rate limited (20 requests per minute)

### Database
The app automatically creates these tables:
- `polls` - Poll metadata
- `options` - Poll answer options
- `votes` - Individual votes
- `questions` & `q_options` - Additional question tracking

## Environment Variables

- `PORT` - Server port (default: 3000)

## Docker Support

A Dockerfile is included for containerized deployment.

## Browser Support

The app works on all modern browsers that support:
- ES6 JavaScript
- WebSocket (for Socket.IO)
- LocalStorage (for cookie functionality)

## Fairness & Anti-Abuse Mechanisms

### 1. **Browser Fingerprinting with Voter Hash**
The application implements browser fingerprinting to uniquely identify voters and prevent multiple votes from the same person:
- **Implementation:** Combines IP address (from request headers) and User-Agent string into a SHA256 hash
- **Storage:** Voter hash is stored with each vote in the database
- **Verification:** When a user attempts to vote, both the fingerprint hash AND voter cookie are checked (OR logic) to catch voters who try to clear cookies
- **Result:** Prevents the same user from voting multiple times even if they delete cookies or use incognito mode (unless they use a VPN/proxy)

### 2. **Rate Limiting on API Endpoints**
The application uses express-rate-limit to prevent abuse:
- **Poll Creation:** Limited to 10 requests per minute per IP address
  - Prevents spam creation of malicious polls
  - Enforces rate limit at application level
- **Voting:** Limited to 20 requests per minute per IP address
  - Prevents automated voting scripts
  - Protects against DDoS-style attacks on specific polls
- **Configuration:** Limits are enforced per IP address in the request context

**Additional Anti-Abuse Features:**
- **Vote Uniqueness Check:** Database enforces one vote per question per voter (for single-question polls) or configurable limit (for multi-question polls)
- **HttpOnly Cookies:** Voter cookies are set with `HttpOnly` and `SameSite=lax` flags to prevent XSS attacks
- **Input Validation:** Poll options and questions are truncated to safe lengths (200-300 characters)

## Edge Cases Handled

### Successfully Handled:
1. **Duplicate Vote Prevention via Dual Mechanism**
   - If voter clears browser cookies, the fingerprint hash still prevents voting again
   - If voter uses incognito mode, both cookie and fingerprint are regenerated but checked against database

2. **Rate Limiting Behind NAT/Proxy**
   - Checks `X-Forwarded-For` header first (for load-balanced environments)
   - Falls back to socket IP address for direct connections

3. **Invalid or Malformed Requests**
   - Validates question format (must have at least 2 options)
   - Sanitizes input by limiting string lengths
   - Returns appropriate HTTP status codes (400, 409, 429, 404, 500)

4. **Database Integrity**
   - Uses prepared statements to prevent SQL injection
   - Foreign key relationships maintain referential integrity
   - Indexes on frequently-queried columns (poll_id, voter_cookie, voter_hash) for performance

5. **Real-time Consistency**
   - Socket.IO updates all connected clients when results change
   - Prevents stale data display in real-time voting scenarios

### Known Limitations & Improvement Opportunities

#### Current Limitations:
1. **VPN/Proxy Circumvention**
   - Users on the same VPN will share the same IP, causing false positives in attack detection
   - Browser fingerprinting alone is not cryptographically secure against sophisticated adversaries

2. **Browser Fingerprinting Limitations**
   - User-Agent header can be spoofed or change (browser updates, extensions)
   - Cannot reliably distinguish multiple users on shared devices (family, office computers)
   - Users with identical IP + User-Agent will be treated as the same person

3. **No HTTPS/SSL Support**
   - Default deployment runs over HTTP, making it vulnerable to MITM attacks
   - Authentication/identity verification not implemented

4. **Single Database Instance**
   - No horizontal scaling capability
   - SQLite not suitable for high-concurrency production environments
   - No backup or disaster recovery mechanisms

5. **No Session/User Authentication**
   - Purely anonymous voting with no user accounts
   - No way to revoke votes or audit who voted
   - No way to prevent vote manipulation if database is compromised

#### Future Improvements:
1. **Enhanced Verification**
   - Implement CAPTCHA to prevent automated voting
   - Add email verification for sensitive polls
   - Implement WebAuthn for stronger identity verification

2. **Scalability**
   - Migrate to PostgreSQL for production deployment
   - Implement Redis for rate limiting and caching
   - Deploy behind a proper reverse proxy (nginx) with HTTPS

3. **Security Hardening**
   - Enable CORS restrictions instead of "*"
   - Implement CSRF tokens for state-changing operations
   - Add input sanitization/XSS protection headers
   - Implement request signing for API endpoints

4. **User Experience**
   - Implement poll expiration/archival
   - Add poll creator dashboard with edit/delete capabilities
   - Show live voter count (with privacy considerations)
   - Add analytics for poll creators

5. **Monitoring**
   - Add logging and alerting for suspicious voting patterns
   - Implement IP-based reputation scoring
   - Add metrics for rate limit violations
   - Monitor database query performance

## License

This project is open source and available under the MIT License.
