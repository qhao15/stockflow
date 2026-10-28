import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import api, { downloadFile, errorMessage } from '../../lib/api';

// Upload an .xlsx file. The server checks every row first and imports all or nothing.
export default function ImportDialog({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setResult(null);
  }, [open]);

  const downloadTemplate = async () => {
    try {
      await downloadFile('/products/import-template', undefined, 'product-import-template.xlsx');
    } catch (err) {
      setResult({ severity: 'error', message: errorMessage(err, 'Could not download the template') });
    }
  };

  const upload = async () => {
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    setResult(null);
    try {
      const res = await api.post('/products/import', body);
      setResult({ severity: 'success', message: res.data.message });
      setFile(null);
      onImported();
    } catch (err) {
      const data = err.response?.data;
      setResult({
        severity: 'error',
        message: errorMessage(err, 'Import failed'),
        errors: data?.errors,
        more: data?.errorCount > (data?.errors?.length ?? 0) ? data.errorCount - data.errors.length : 0,
      });
    } finally {
      setUploading(false);
    }
  };

  const chooseFile = (e) => {
    setFile(e.target.files[0] ?? null);
    setResult(null);
    e.target.value = ''; // allow choosing the same file again after fixing it
  };

  return (
    <Dialog open={open} onClose={uploading ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import products from Excel</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" component="div">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Use the template, or an exported product list. One product per row.</li>
            <li>A row with an existing SKU updates that product; a new SKU creates a product.</li>
            <li>The whole file is checked first. If any row has a problem, <b>nothing</b> is imported and you get the list of problems.</li>
          </ul>
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', my: 2 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={downloadTemplate}>Download template</Button>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => inputRef.current.click()} disabled={uploading}>
            Choose file
          </Button>
          <input ref={inputRef} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} />
          <Typography variant="body2" color={file ? 'text.primary' : 'text.secondary'} noWrap sx={{ maxWidth: 280 }}>
            {file ? file.name : 'No file chosen (.xlsx, max 5 MB)'}
          </Typography>
        </Box>

        {result && <Alert severity={result.severity} sx={{ mb: result.errors ? 1 : 0 }}>{result.message}</Alert>}
        {result?.errors && (
          <TableContainer sx={{ maxHeight: 280, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 70 }}>Row</TableCell>
                  <TableCell sx={{ width: 120 }}>Column</TableCell>
                  <TableCell>Problem</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.errors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.column}</TableCell>
                    <TableCell>{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {result?.more > 0 && (
          <Typography variant="caption" color="text.secondary">...and {result.more} more problem(s).</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>{result?.severity === 'success' ? 'Done' : 'Cancel'}</Button>
        <Button variant="contained" onClick={upload} disabled={!file || uploading}>
          {uploading ? 'Importing...' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
