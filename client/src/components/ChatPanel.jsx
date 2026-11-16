import { Fragment, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, ClickAwayListener, Fab, IconButton, Link, List, ListItem, ListItemButton, ListItemText, Paper, Stack, TextField, Tooltip,
  Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import RobotIcon from '@mui/icons-material/SmartToyOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ChatsIcon from '@mui/icons-material/ViewSidebarOutlined';
import BackIcon from '@mui/icons-material/ArrowBack';
import api, { getToken } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

const MAX_QUESTION_LENGTH = 500;
// The server accepts 20; the oldest drop off so a long chat keeps working.
const MAX_MESSAGES = 20;
// What's kept in the browser: the newest chats, each with its latest messages.
const MAX_CHATS = 30;
const MAX_SAVED_MESSAGES = 60;

// [label](/path) becomes a link to that page in the app. Only paths starting with one /
// are linked, so an answer can never send the user to another website.
const LINK = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;
function Line({ text, onLink }) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    parts.push(text.slice(last, match.index));
    parts.push(<Link key={match.index} component={RouterLink} to={match[2]} onClick={onLink} underline="hover" fontWeight={600}>{match[1]}</Link>);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Message({ role, content, onLink }) {
  const mine = role === 'user';
  return (
    <Box sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
      <Box
        sx={{
          px: 1.5, py: 1, borderRadius: 2, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          bgcolor: mine ? 'primary.main' : 'grey.100', color: mine ? 'primary.contrastText' : 'text.primary',
        }}
      >
        {mine ? content : content.split('\n').map((line, i) => <Fragment key={i}>{i > 0 && '\n'}<Line text={line} onLink={onLink} /></Fragment>)}
      </Box>
    </Box>
  );
}

// Reads the server-sent events of POST /api/chat, calling onText with each part of the answer.
async function streamAnswer(messages, onText) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.message ?? (res.status >= 500 ? 'Cannot reach the server' : 'Could not get an answer'));
    error.status = res.status;
    throw error;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split('\n\n');
    buffer = events.pop();
    for (const raw of events) {
      const event = JSON.parse(raw.replace(/^data: /, ''));
      if (event.type === 'text') onText(event.text);
      if (event.type === 'error') throw new Error(event.message);
    }
  }
}

// Chats are kept in this browser, separately for each user. Storage can be unavailable
// (private windows, blocked site data): the chat still works, it just isn't kept.
const storageKey = (user) => `stockflow.chats.${user.id}`;
function loadChats(user) {
  try {
    const chats = JSON.parse(localStorage.getItem(storageKey(user)));
    return Array.isArray(chats) ? chats : [];
  } catch {
    return [];
  }
}
function saveChats(user, chats) {
  try {
    localStorage.setItem(storageKey(user), JSON.stringify(chats));
  } catch {
    // storage full or unavailable
  }
}

// The height the user dragged the window to, kept in this browser. null = sized by its content.
const HEIGHT_KEY = 'stockflow.chatHeight';
const MIN_HEIGHT = 320;
const HEIGHT_STEP = 40; // per arrow key
function loadHeight() {
  try {
    const height = Number(localStorage.getItem(HEIGHT_KEY));
    return height >= MIN_HEIGHT ? height : null;
  } catch {
    return null;
  }
}
function saveHeight(height) {
  try {
    if (height) localStorage.setItem(HEIGHT_KEY, String(height));
    else localStorage.removeItem(HEIGHT_KEY);
  } catch {
    // storage unavailable: the height lasts until the page is reloaded
  }
}

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const titleOf = (question) => (question.length > 40 ? `${question.slice(0, 39)}…` : question);

// The list of saved chats, newest first. onBack: on a phone the list fills the window, so it
// gets its own way back to the conversation.
function ChatList({ chats, activeId, busy, onSelect, onNew, onDelete, onBack }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {onBack && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <IconButton aria-label="Hide chats" onClick={onBack}><BackIcon /></IconButton>
          <Typography fontWeight={700}>Chats</Typography>
        </Box>
      )}
      <Box sx={{ p: 1.5 }}>
        <Button fullWidth variant="outlined" size="small" startIcon={<AddIcon />} onClick={onNew} disabled={busy}>New chat</Button>
      </Box>
      {chats.length === 0 && <Typography color="text.secondary" fontSize={13} sx={{ px: 2 }}>No saved chats yet.</Typography>}
      <List dense aria-label="Saved chats" sx={{ overflowY: 'auto', flexGrow: 1, py: 0 }}>
        {chats.map((chat) => (
          // The delete button sits beside the chat's button, not inside it: a button can't hold another.
          <ListItem
            key={chat.id} disablePadding
            sx={{ '&:hover .delete-chat, &:focus-within .delete-chat, &:has(.Mui-selected) .delete-chat': { visibility: 'visible' } }}
            secondaryAction={(
              <IconButton
                className="delete-chat" edge="end" size="small" aria-label={`Delete chat ${chat.title}`} disabled={busy}
                sx={{ visibility: { xs: 'visible', sm: 'hidden' } }} onClick={() => onDelete(chat.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          >
            <ListItemButton selected={chat.id === activeId} disabled={busy} onClick={() => onSelect(chat.id)}>
              <ListItemText primary={chat.title} primaryTypographyProps={{ noWrap: true, fontSize: 13 }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

// The assistant: a robot button fixed to the bottom-right corner that opens a small chat
// window above it. The window doesn't block the page: a click outside it closes it and still
// does what it was meant to, such as following a menu link.
export default function ChatPanel() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [chats, setChats] = useState(() => loadChats(user));
  const [activeId, setActiveId] = useState(null); // null = a new chat, not saved until its first question
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [height, setHeight] = useState(loadHeight);
  const endRef = useRef(null);
  const buttonRef = useRef(null);
  const windowRef = useRef(null);

  const active = chats.find((c) => c.id === activeId);
  const messages = active?.messages ?? [];

  useEffect(() => {
    api.get('/chat/options').then((res) => setEnabled(res.data.enabled)).catch(() => setEnabled(false));
  }, []);

  useEffect(() => saveChats(user, chats), [user, chats]);
  useEffect(() => saveHeight(height), [height]);

  // The window sits on the robot button, so it grows upwards: from its bottom edge to 8 px under
  // the top bar at most.
  const maxHeight = () => window.innerHeight - (narrow ? 160 : 128);
  const clampHeight = (value) => Math.round(Math.min(Math.max(value, MIN_HEIGHT), maxHeight()));

  // Dragging the bar at the top of the window: up makes it taller.
  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = windowRef.current.getBoundingClientRect().height;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (event) => setHeight(clampHeight(startHeight + startY - event.clientY));
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
  };

  const resizeByKey = (e) => {
    const step = { ArrowUp: HEIGHT_STEP, ArrowDown: -HEIGHT_STEP }[e.key];
    if (!step) return;
    e.preventDefault();
    setHeight(clampHeight((height ?? windowRef.current.getBoundingClientRect().height) + step));
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open, showList]);

  // Changes one chat, keeping the newest first and only the latest messages.
  const updateChat = (id, change) => setChats((prev) => {
    const chat = change(prev.find((c) => c.id === id));
    const saved = { ...chat, messages: chat.messages.slice(-MAX_SAVED_MESSAGES), updatedAt: Date.now() };
    return [saved, ...prev.filter((c) => c.id !== id)].slice(0, MAX_CHATS);
  });

  const startNew = () => {
    setActiveId(null);
    setError('');
    if (narrow) setShowList(false);
  };

  const select = (id) => {
    setActiveId(id);
    setError('');
    if (narrow) setShowList(false);
  };

  const remove = (id) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) startNew();
  };

  const ask = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    const id = activeId ?? newId();
    const conversation = [...messages, { role: 'user', content: text }];
    updateChat(id, (chat) => ({
      id, title: chat?.title ?? titleOf(text), messages: [...conversation, { role: 'assistant', content: '' }],
    }));
    setActiveId(id);
    setQuestion('');
    setError('');
    setBusy(true);
    try {
      await streamAnswer(conversation.slice(-MAX_MESSAGES), (part) => updateChat(id, (chat) => ({
        ...chat,
        messages: [...chat.messages.slice(0, -1), { role: 'assistant', content: chat.messages.at(-1).content + part }],
      })));
    } catch (err) {
      if (err.status === 401) {
        logout(true);
        return;
      }
      updateChat(id, (chat) => ({ ...chat, messages: conversation })); // the question stays, without an empty answer
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  const listOnly = narrow && showList;
  return (
    <>
      {open && (
        // The robot button is left out: it toggles the window itself.
        <ClickAwayListener onClickAway={(e) => !buttonRef.current?.contains(e.target) && setOpen(false)}>
          <Paper
            ref={windowRef} role="dialog" aria-label="Assistant" elevation={8}
            sx={{
              position: 'fixed', zIndex: theme.zIndex.drawer + 50, display: 'flex', overflow: 'hidden', borderRadius: 3,
              right: { xs: 8, sm: 24 }, bottom: { xs: 84, sm: 96 },
              width: { xs: 'calc(100vw - 16px)', sm: showList ? 640 : 400 },
              // Grows with the conversation between these, then the messages scroll.
              minHeight: 'min(320px, calc(100vh - 160px))',
              maxHeight: { xs: 'calc(100vh - 160px)', sm: height ? 'calc(100vh - 128px)' : 'min(560px, calc(100vh - 128px))' },
              ...(height ? { height } : {}),
            }}
          >
            <Box
              role="separator" aria-orientation="horizontal" aria-label="Resize the assistant" tabIndex={0}
              aria-valuemin={MIN_HEIGHT} aria-valuenow={height ?? undefined}
              title="Drag to change the height. Double-click to size it to the chat."
              onPointerDown={startResize} onKeyDown={resizeByKey} onDoubleClick={() => setHeight(null)}
              sx={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 10, zIndex: 1, cursor: 'ns-resize', touchAction: 'none',
                '&::after': { content: '""', position: 'absolute', top: 4, left: 'calc(50% - 20px)', width: 40, height: 4, borderRadius: 2, bgcolor: 'grey.400' },
                '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
                '&:focus-visible': { outline: 'none' },
              }}
            />
            {showList && (
              <Box sx={{ width: listOnly ? '100%' : 220, flexShrink: 0, borderRight: listOnly ? 0 : 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                <ChatList chats={chats} activeId={activeId} busy={busy} onSelect={select} onNew={startNew} onDelete={remove}
                  onBack={listOnly ? () => setShowList(false) : undefined} />
              </Box>
            )}
            <Box sx={{ display: listOnly ? 'none' : 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, minHeight: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Tooltip title={showList ? 'Hide chats' : 'Show chats'}>
                  <IconButton aria-label={showList ? 'Hide chats' : 'Show chats'} onClick={() => setShowList((v) => !v)}><ChatsIcon /></IconButton>
                </Tooltip>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} noWrap>{active?.title ?? 'Assistant'}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">Uses what your role can see. Changes nothing.</Typography>
                </Box>
                <Tooltip title="New chat">
                  <span><IconButton aria-label="New chat" onClick={startNew} disabled={busy || !activeId}><AddIcon /></IconButton></span>
                </Tooltip>
              </Box>

              <Stack spacing={1.5} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
                {messages.length === 0 && (
                  <Typography color="text.secondary" fontSize={14}>
                    Ask about stock, products, orders or this month&apos;s figures. Try &quot;Which products are low on stock?&quot;
                  </Typography>
                )}
                {messages.map((m, i) => (
                  // By position: messages are only ever added at the end.
                  <Message key={i} role={m.role} content={m.content || (busy && i === messages.length - 1 ? '…' : '')}
                    onLink={narrow ? () => setOpen(false) : undefined} />
                ))}
                {error && <Alert severity="error">{error}</Alert>}
                <div ref={endRef} />
              </Stack>

              <Box component="form" onSubmit={ask} sx={{ display: 'flex', gap: 1, p: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <TextField
                  size="small" fullWidth autoFocus label="Ask a question" value={question}
                  onChange={(e) => setQuestion(e.target.value)} disabled={busy} inputProps={{ maxLength: MAX_QUESTION_LENGTH }}
                />
                <IconButton type="submit" color="primary" aria-label="Send" disabled={busy || !question.trim()}><SendIcon /></IconButton>
              </Box>
            </Box>
          </Paper>
        </ClickAwayListener>
      )}

      <Tooltip title={open ? 'Close assistant' : 'Assistant'} placement="left">
        <Fab
          ref={buttonRef}
          color="primary" aria-label={open ? 'Close assistant' : 'Open assistant'} onClick={() => setOpen((v) => !v)}
          sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: theme.zIndex.drawer + 50 }}
        >
          {open ? <CloseIcon /> : <RobotIcon />}
        </Fab>
      </Tooltip>
    </>
  );
}
