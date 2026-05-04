\begin{rSubsection}{Vaani -- Real-Time Multilingual Communication Platform}{}
{React.js, Node.js, Express.js, Socket.IO, WebRTC, MongoDB, Azure Speech \& Translator SDK, JWT}{}

\item Identified the absence of live in-call translation in tools like Zoom/Meet as a core gap; built
      a voice-to-voice translation platform where users speak in their native language and the remote
      participant hears synthesised translated audio within \textbf{$<$500ms} end-to-end

\item Architected a Socket.IO server with JWT authentication middleware on every WebSocket handshake;
      multiplexed \textbf{3 concurrent event streams} per active call---partial STT transcripts,
      final translated text, and base64-encoded TTS audio chunks---using an ordered event-driven
      pipeline with graceful partial-result streaming to the sender before final synthesis

\item Replaced a 3-call Azure pipeline (STT $\rightarrow$ Translate $\rightarrow$ TTS) with the
      single-round-trip Speech Translation SDK, then layered a \textbf{7-day TTL LRU cache} on top
      to suppress redundant API calls for repeated phrases, with hourly eviction and hit-rate telemetry

\item Cut audio processing latency \textbf{4$\times$} by tuning the Web Audio ScriptProcessor buffer
      from 2048 $\rightarrow$ 512 samples ($\sim$128ms $\rightarrow$ $\sim$32ms per chunk); set
      10 MB per-socket buffer ceiling on Socket.IO and fired optimistic socket emits \emph{before}
      the MongoDB write to achieve near-zero perceived message delivery latency

\item Implemented bcrypt password hashing, JWT-protected REST routes, paginated MongoDB chat history,
      and real-time message delivery/seen status updates propagated over sockets; stabilised WebRTC
      across flaky networks with STUN/ICE signaling and pending-call state persistence across browser
      refreshes

\end{rSubsection}






\begin{rSubsection}{Vaani -- Real-Time Multilingual Communication Platform}{}
{React.js, Node.js, Express.js, Socket.IO, WebRTC, MongoDB, Azure Speech \& Translator SDK, JWT}{}

\item Identified that tools like \textbf{Zoom and Google Meet offer zero native translation}, forcing multilingual teams to context-switch mid-call; built a \textbf{voice-to-voice translation pipeline} supporting \textbf{40+ language pairs} with \textbf{sub-500ms end-to-end latency}

\item Replaced a 3-step STT $\rightarrow$ Translate $\rightarrow$ TTS chain with a \textbf{single Azure Speech Translation SDK call} (\texttt{translateSpeechDirect}), \textbf{cutting API round-trips by 2$\times$} and streaming \textbf{partial transcripts to the caller UI before recognition completes} --- reducing perceived lag without waiting for final synthesis

\item Reduced audio processing latency \textbf{4$\times$ (128ms $\rightarrow$ 32ms per chunk)} by tuning the Web Audio API \texttt{ScriptProcessorNode} buffer \textbf{from 2048 to 512 samples}, with \textbf{VAD silence detection} to suppress empty audio frames and avoid redundant API calls

\item Built a \textbf{TTL-based LRU translation cache} (7-day expiry, hourly eviction sweep) to \textbf{short-circuit repeated Azure Translator and TTS requests} for common phrases, with \textbf{hit/miss telemetry} exposed via a stats endpoint

\item Built an \textbf{event-driven Socket.IO signaling layer} for one-to-one and group \textbf{WebRTC calls} with offer/answer exchange, ICE relay, and \textbf{reconnect-safe persistence}; secured via a \textbf{3-layer auth stack} (JWT, Socket middleware, \textbf{bcrypt}) and enabled \textbf{optimistic messaging} for low-latency delivery

\end{rSubsection}