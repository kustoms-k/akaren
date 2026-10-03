import { Router } from 'express';
import { notFound } from '../lib/http.js';

/** Office access to photos (/api/photos/:id). Ids are random; access is still checked per company. */
export function photosRouter({ photos }) {
  const router = Router();
  router.get('/:id', (req, res) => {
    const photo = photos.get(req.params.id, req.companyId);
    if (!photo) throw notFound('Bilden finns inte.');
    photos.send(res, photo.id);
  });
  return router;
}
