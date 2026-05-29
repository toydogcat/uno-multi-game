# UNO Multiplayer - Luna AI Hub Edition

This is a multiplayer [UNO game](https://toydogcat.github.io/uno-multi-game/) built using WebRTC for P2P connectivity, designed to be integrated into the Luna AI Hub.

## Features
- **P2P Multiplayer**: Real-time gameplay using WebRTC.
- **Visitor Counter**: Integrated with Vercount.one.
- **Luna AI Hub Sync**: Automatic scroll synchronization with the parent hub.
- **GitHub Pages Ready**: Automated deployment via GitHub Actions.

## Deployment

### 1. Backend Signaling Server
Since GitHub Pages is static, you need to host the signaling server (`server.ts`) on a platform that supports Node.js (e.g., Vercel, Render, Railway).

1. Deploy the project to your preferred backend host.
2. Note the URL of your deployed backend.

### 2. Frontend (GitHub Pages)
The project is configured to deploy to GitHub Pages automatically via GitHub Actions.

1. Go to your GitHub repository settings.
2. Under **Actions** -> **General**, ensure "Read and write permissions" are enabled for `GITHUB_TOKEN`.
3. Set a repository secret or environment variable `VITE_API_BASE_URL` to your backend URL if it's hosted separately.
   - Alternatively, you can modify `src/hooks/useUnoGame.ts` to hardcode the URL.
4. Push your changes to the `main` branch.

## Development

1. Install dependencies:
   `npm install`
2. Run the development server (includes the local signaling server):
   `npm run dev`
3. Access the app at `http://localhost:3000`

## Integration with Luna AI Hub
To add this project to Luna AI Hub, use the following configuration in `App.jsx`:

```javascript
{
  id: 'uno-game',
  translationKey: 'projects.unoGame',
  url: 'https://toydogcat.github.io/uno-multi-game/',
  icon: <Play size={24} />
}
```
