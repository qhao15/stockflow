import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Alert, AppBar, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu,
  MenuItem, Snackbar, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { navItems } from '../navItems';
import { useAuth } from '../auth/AuthContext';
import Logo, { LogoMark } from './Logo';
import { takeFlash } from '../lib/flash';

const drawerWidth = 250;
const collapsedWidth = 72;
const COLLAPSED_KEY = 'stockflow.sidebarCollapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function Layout() {
  const theme = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [flash, setFlashMessage] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // A message left for after a page reload, e.g. "Account created" after registering.
  useEffect(() => {
    const message = takeFlash();
    if (message) setFlashMessage(message);
  }, []);
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const visibleItems = navItems.filter((item) => can(item.permission));
  const current = location.pathname === '/account'
    ? { label: 'Account settings' }
    : navItems.find((item) => item.path === location.pathname);

  // The mobile drawer always opens full width; collapsing only applies on desktop.
  const sidebarWidth = collapsed ? collapsedWidth : drawerWidth;
  const widthTransition = theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.standard,
  });

  // Asks first; confirming clears the session and reloads onto the login page.
  const handleLogout = () => {
    setMenuAnchor(null);
    setConfirmLogout(true);
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, String(!prev));
      } catch {
        // storage unavailable (private mode) - state still works for this session
      }
      return !prev;
    });
  };

  const renderDrawer = (mini) => (
    <Box>
      <Toolbar sx={{ justifyContent: mini ? 'center' : 'flex-start', px: mini ? 0 : 2 }}>
        {mini ? <LogoMark size={32} /> : <Logo />}
      </Toolbar>
      <Divider />
      <List sx={{ px: 1 }}>
        {visibleItems.map(({ label, path, icon: Icon }) => (
          <Tooltip key={path} title={mini ? label : ''} placement="right">
            <ListItemButton
              component={NavLink}
              to={path}
              end={path === '/'}
              onClick={() => setMobileOpen(false)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                justifyContent: mini ? 'center' : 'flex-start',
                px: mini ? 0 : 2,
                '&.active': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                },
                '&.active:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <ListItemIcon sx={{ minWidth: mini ? 0 : 40, justifyContent: 'center' }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              {!mini && <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, noWrap: true }} />}
            </ListItemButton>
          </Tooltip>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${sidebarWidth}px)` },
          ml: { md: `${sidebarWidth}px` },
          borderBottom: 1,
          borderColor: 'divider',
          transition: widthTransition,
        }}
      >
        <Toolbar>
          <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 2, display: { md: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }} noWrap>
            {current?.label ?? 'Sales & Inventory'}
          </Typography>
          <Tooltip title="Account">
            <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            // Keep the page scrollbar visible while open, so the layout doesn't shift.
            disableScrollLock
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 220 } } }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography fontWeight={600} noWrap>{user?.name}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>{user?.email}</Typography>
              <Chip label={user?.role} size="small" color="primary" variant="outlined" sx={{ mt: 1, textTransform: 'capitalize' }} />
            </Box>
            <Divider sx={{ my: 1 }} />
            <MenuItem component={NavLink} to="/account" onClick={() => setMenuAnchor(null)}>
              <ListItemIcon>
                <ManageAccountsIcon fontSize="small" />
              </ListItemIcon>
              Account settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Log out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: sidebarWidth }, flexShrink: { md: 0 }, transition: widthTransition }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
        >
          {renderDrawer(false)}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: sidebarWidth, overflowX: 'hidden', transition: widthTransition },
          }}
        >
          {renderDrawer(collapsed)}
        </Drawer>
        {/* Sits on the sidebar's right edge; outside the drawer paper so overflow doesn't clip it. */}
        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <IconButton
            size="small"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              position: 'fixed',
              top: 18,
              left: sidebarWidth - 14,
              width: 28,
              height: 28,
              zIndex: theme.zIndex.drawer + 1,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              boxShadow: 1,
              transition: theme.transitions.create('left', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.standard,
              }),
              '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' },
            }}
          >
            {/* Menu icons rather than arrows, which read as "go back". */}
            {collapsed ? <MenuIcon fontSize="small" /> : <MenuOpenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, width: { md: `calc(100% - ${sidebarWidth}px)` }, transition: widthTransition }}
      >
        <Toolbar />
        <Outlet />
      </Box>

      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)} maxWidth="xs" fullWidth>
        <DialogTitle>You want to log out?</DialogTitle>
        <DialogContent>
          <DialogContentText>You can log in again to use StockFlow.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLogout(false)} autoFocus>Cancel</Button>
          <Button variant="contained" startIcon={<LogoutIcon />} onClick={() => logout()}>Log out</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(flash)}
        autoHideDuration={6000}
        onClose={() => setFlashMessage(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        // Just below the top bar instead of covering it.
        sx={{ top: { xs: 64, sm: 76 } }}
      >
        {flash ? (
          <Alert severity={flash.severity} variant="filled" onClose={() => setFlashMessage(null)}>{flash.message}</Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
