import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Alert, Box, Card, CardContent, MenuItem, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import api, { errorMessage } from '../../lib/api';
import { money } from '../../lib/format';

// Loaded on its own (see Dashboard.jsx): Recharts is large, and Staff never see these charts.
// Blue and teal passed the palette checks (colour-blind separation, contrast on white).
const COLORS = { revenue: '#1e5eff', profit: '#0d9488', grid: '#e4e7ec', axis: '#667085' };
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
// Two decimals on the axis, or a tick at $1.05M would read as $1.1M.
const axisMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const axisTick = { fontSize: 12, fill: COLORS.axis };

// '2026-10-03' -> "Oct 3", '2026-10' -> "Oct 26". Built from the parts, so the time zone can't shift the day.
function formatPeriod(period, group) {
  const [year, month, day] = period.split('-').map(Number);
  const date = new Date(year, month - 1, day ?? 1);
  return group === 'month'
    ? date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Total({ label, value, color }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {color && <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />}
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>{value}</Typography>
    </Box>
  );
}

// Revenue and gross profit over time, as a line chart or the same numbers as a table.
export function RevenueChart() {
  const [group, setGroup] = useState('day');
  const [range, setRange] = useState({ from: '', to: '' });
  const [view, setView] = useState('chart');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api
      .get('/reports/revenue', { params: { group, from: range.from || undefined, to: range.to || undefined } })
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load the revenue report')));
    return () => { cancelled = true; };
  }, [group, range]);

  // A new grouping starts from its own default range (30 days, or 12 months).
  const changeGroup = (e, value) => {
    if (!value) return;
    setGroup(value);
    setRange({ from: '', to: '' });
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>Revenue and gross profit</Typography>
          <ToggleButtonGroup size="small" exclusive value={group} onChange={changeGroup} aria-label="Group by">
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" type="date" label="From" value={range.from || data?.from || ''}
            onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" type="date" label="To" value={range.to || data?.to || ''}
            onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(e, value) => value && setView(value)} aria-label="View">
            <ToggleButton value="chart">Chart</ToggleButton>
            <ToggleButton value="table">Table</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!data && !error && <Skeleton variant="rounded" height={340} />}
        {data && (
          <>
            <Stack direction="row" spacing={4} sx={{ mb: 2 }}>
              <Total label="Revenue" value={money.format(data.totals.revenue)} color={COLORS.revenue} />
              <Total label="Gross profit" value={money.format(data.totals.profit)} color={COLORS.profit} />
              <Total label="Orders" value={data.totals.orders.toLocaleString()} />
            </Stack>
            {view === 'chart' ? (
              <Box sx={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={COLORS.grid} />
                    <XAxis dataKey="period" tickFormatter={(p) => formatPeriod(p, data.group)} tick={axisTick}
                      tickLine={false} axisLine={{ stroke: COLORS.grid }} minTickGap={24} />
                    <YAxis tickFormatter={(v) => axisMoney.format(v)} tick={axisTick} tickLine={false} axisLine={false} width={64} />
                    <Tooltip
                      labelFormatter={(p) => formatPeriod(p, data.group)}
                      formatter={(value, name) => [money.format(value), name]}
                    />
                    <Legend iconType="plainline" itemSorter={null} wrapperStyle={{ fontSize: 13 }}
                      formatter={(name) => <span style={{ color: COLORS.axis }}>{name}</span>} />
                    <Line type="linear" dataKey="revenue" name="Revenue" stroke={COLORS.revenue} strokeWidth={2} dot={false}
                      activeDot={{ r: 5 }} isAnimationActive={false} />
                    <Line type="linear" dataKey="profit" name="Gross profit" stroke={COLORS.profit} strokeWidth={2} dot={false}
                      activeDot={{ r: 5 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 280 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{data.group === 'month' ? 'Month' : 'Day'}</TableCell>
                      <TableCell align="right">Orders</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                      <TableCell align="right">Gross profit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r.period} hover>
                        <TableCell>{formatPeriod(r.period, data.group)}</TableCell>
                        <TableCell align="right">{r.orders.toLocaleString()}</TableCell>
                        <TableCell align="right">{money.format(r.revenue)}</TableCell>
                        <TableCell align="right">{money.format(r.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const pastDay = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

// Best sellers for a recent period, ranked, with the value at the end of each bar.
export function TopProductsChart() {
  const [by, setBy] = useState('quantity');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api
      .get('/reports/top-products', { params: { by, from: pastDay(days - 1), limit: 8 } })
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load top products')));
    return () => { cancelled = true; };
  }, [by, days]);

  const format = (value) => (by === 'revenue' ? compact.format(value) : value.toLocaleString());

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>Top products</Typography>
          <TextField select size="small" label="Period" value={days} onChange={(e) => setDays(e.target.value)} sx={{ minWidth: 120 }}>
            <MenuItem value={7}>7 days</MenuItem>
            <MenuItem value={30}>30 days</MenuItem>
            <MenuItem value={90}>90 days</MenuItem>
          </TextField>
          <ToggleButtonGroup size="small" exclusive value={by} onChange={(e, value) => value && setBy(value)} aria-label="Rank by">
            <ToggleButton value="quantity">Quantity</ToggleButton>
            <ToggleButton value="revenue">Revenue</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && <Skeleton variant="rounded" height={320} />}
        {data && data.rows.length === 0 && <Typography color="text.secondary">No sales in this period.</Typography>}
        {data && data.rows.length > 0 && (
          <>
            <Box sx={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={data.rows} margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap="30%">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={240} tickLine={false} axisLine={false} interval={0}
                    tick={axisTick} tickFormatter={(name) => (name.length > 36 ? `${name.slice(0, 35)}…` : name)} />
                  <Tooltip
                    cursor={{ fill: '#f2f4f7' }}
                    labelFormatter={(name, payload) => `${name}${payload?.[0] ? ` (${payload[0].payload.sku})` : ''}`}
                    formatter={(value) => [by === 'revenue' ? money.format(value) : value.toLocaleString(), by === 'revenue' ? 'Revenue' : 'Units sold']}
                  />
                  <Bar dataKey={by} fill={COLORS.revenue} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    <LabelList dataKey={by} position="right" formatter={format} style={{ fontSize: 12, fill: '#1d2939' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
            {by === 'revenue' && (
              <Typography variant="caption" color="text.secondary">Before order discounts, which apply to a whole order rather than one product.</Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardCharts({ lowStock }) {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={12}><RevenueChart /></Grid>
      <Grid size={{ xs: 12, lg: 6 }}><TopProductsChart /></Grid>
      <Grid size={{ xs: 12, lg: 6 }}>{lowStock}</Grid>
    </Grid>
  );
}
