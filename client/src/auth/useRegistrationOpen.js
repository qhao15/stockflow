import { useEffect, useState } from 'react';
import api from '../lib/api';

// Whether sign-up is offered. The server has the final say, so if this can't be checked the
// pages just stay as they are.
export default function useRegistrationOpen() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    api
      .get('/auth/options')
      .then((res) => setOpen(res.data.registrationOpen))
      .catch(() => {});
  }, []);

  return open;
}
