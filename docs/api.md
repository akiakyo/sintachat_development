# SintaChat API

**Author:** aky ([@akiakyo](https://github.com/akiakyo)), SintaChat

An overview of what the SintaChat web app talks to. It's here to show how the product is put
together. It isn't a public developer API: there are no keys to request, and requests from outside
sintachat.com are not supported.

- **REST:** `https://api.sintachat.com`, JSON in and out.
- **Real time:** WebSockets to two Durable Objects, the **Matchmaker** and a **Conversation**.
- **Sessions:** each browser holds an anonymous session. Requests that act on someone's own data
  prove the session with a signed key.

Staff tools (the moderation and admin panel) are left out of this document on purpose.

## REST endpoints

### App

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Is the API up |
| GET | `/api/config` | Feature switches and settings the app needs at start |
| POST | `/api/session/claim` | Ties an anonymous session to this browser |
| GET | `/api/nickname/check` | Is a nickname allowed |
| GET | `/api/popup` | The announcement to show, if any |
| GET | `/api/team` | The public team roster |

### Chat

| Method | Path | What it does |
|---|---|---|
| POST | `/api/end-chat-beacon` | Ends a chat when the page closes |
| GET | `/api/chat-image/:id` | A photo sent in a chat |
| POST | `/api/ratings` | Rate a finished chat |
| POST | `/api/report` | Report someone |
| POST | `/api/block` | Block someone; they are never matched with you again |
| GET | `/api/history` | People saved to History |
| GET | `/api/inbox` | Notices: wall replies, Notes likes and replies, and more |

### Freedom Wall & Notes

| Method | Path | What it does |
|---|---|---|
| GET, POST | `/api/freedom-wall` | Read the wall, or post to it |
| GET | `/api/freedom-wall/top` | Top posts |
| GET | `/api/freedom-wall/tags` | Tags in use |
| GET | `/api/freedom-wall/streak` | Your wall streak |
| GET, POST | `/api/wall-notes` | Notes from your connections, or share your own (24 hours) |
| POST | `/api/wall-notes/like` | Like a note |
| GET, POST | `/api/wall-notes/replies`, `/api/wall-notes/reply` | Read or send replies |

### Media search

| Method | Path | What it does |
|---|---|---|
| GET | `/api/giphy/search`, `/api/giphy/trending` | GIFs, through GIPHY |
| GET | `/api/spotify/search` | Songs, through Spotify |
| GET | `/api/link-preview` | A preview card for a shared link |

### Loudspeaker

| Method | Path | What it does |
|---|---|---|
| GET | `/api/loudspeaker/current` | The message on air now |
| GET | `/api/loudspeaker/slots` | Open slots |
| POST | `/api/loudspeaker/book` | Book a slot |

### Plans & support

| Method | Path | What it does |
|---|---|---|
| POST | `/api/plus/checkout` | Start a Supporter, Plus or Pro purchase (PayMongo) |
| POST | `/api/plus/redeem` | Redeem a code |
| GET | `/api/finance` | SintaChat's public finances |
| POST | `/api/finance/donate` | Donate |
| POST | `/api/notifications/subscribe` | Email updates (Resend) |
| POST | `/api/feedback` | Send feedback |
| POST | `/api/appeals` | Appeal a moderation decision |

## Real-time events

### Matchmaker

| Event | What it does |
|---|---|
| `set-profile` | Nickname, gender, who you'd like to meet, university, interests |
| `find-match` | Search once; you're paired now or wait in the pool |
| `cancel-find` | Leave the pool |
| `request-rematch`, `respond-rematch` | Reconnect with the person you just talked to |
| `request-reconnect` | Reconnect with someone from History |
| `matched` *(sent to you)* | You have a match; here is the conversation |

### Conversation

| Group | Events |
|---|---|
| Messages | `send-message`, `edit-message`, `unsend-message`, `react-message`, `seen-message`, `typing`, `load-older-messages` |
| Media | `send-image`, `send-voice`, `send-gif`, `send-sticker`, `send-song` |
| Chat | `presence`, `end-chat`, `resume-conversation`, `request-icebreaker`, `set-bubble`, `set-wallpaper`, `history-request` |
| Games | `request-game`, `respond-game-invite`, then each game's own moves (UNO, billiards, Connect Four, Wordle, Word Hunt, drawing, trivia, riddles) |
