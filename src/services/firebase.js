'use strict';

const admin = require('firebase-admin');
const path = require('path');

let db;
let storage;
let initialized = false;
const DEFAULT_TITLE_FIELDS = ['title', 'songName', 'name', 'nombre'];
const DEFAULT_ARTIST_FIELDS = ['artistName', 'artist'];

/**
 * Initialise Firebase Admin SDK.
 * Credentials can be provided either as a file path or as a base64-encoded
 * JSON string (FIREBASE_SERVICE_ACCOUNT_B64) – useful for environments where
 * mounting a file is not practical (e.g. CI/CD or cloud hosting).
 */
function initFirebase() {
  if (initialized) return;

  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(json);
  } else {
    const keyPath = path.resolve(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
    );
    serviceAccount = require(keyPath);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  db = admin.firestore();
  storage = admin.storage();
  initialized = true;
  console.log('[Firebase] Connected successfully.');
}

/**
 * Search songs in Firestore.
 *
 * Supports two strategies:
 *  1. Prefix search on configurable title fields (`title` by default).
 *  2. Prefix search on configurable artist fields as fallback.
 *
 * Firestore document structure (TuneX app):
 * {
 *   id:          "1770324973876",
 *   title:       "mamamovilalcielo",
 *   artistName:  "chakal",
 *   artistId:    "…",
 *   artistEmail: "…",
 *   audioUrl:    "https://firebasestorage.googleapis.com/…",
 *   imageUrl:    "https://firebasestorage.googleapis.com/…",
 *   likes:       0,
 *   likedBy:     [],
 *   lyrics:      "",
 *   presetUrl:   "",
 *   uploadedAt:  Timestamp,
 * }
 *
 * @param {string} query
 * @returns {Promise<Array<Object>>}
 */
async function searchSongs(query) {
  if (!query?.trim()) return [];
  const q = query.toLowerCase().trim();

  const collection = process.env.FIREBASE_SONGS_COLLECTION || 'songs';
  const songsRef = db.collection(collection);
  const titleFields = getSearchFields('FIREBASE_SONG_TITLE_FIELDS', DEFAULT_TITLE_FIELDS);
  const artistFields = getSearchFields('FIREBASE_SONG_ARTIST_FIELDS', DEFAULT_ARTIST_FIELDS);

  for (const field of titleFields) {
    const snap = await prefixSearchByField(songsRef, field, q);
    if (!snap.empty) {
      return snap.docs.map((doc) => normalizeSong(doc));
    }
  }

  for (const field of artistFields) {
    const snap = await prefixSearchByField(songsRef, field, q);
    if (!snap.empty) {
      return snap.docs.map((doc) => normalizeSong(doc));
    }
  }

  return [];
}

/**
 * Prefix search helper for Firestore fields.
 *
 * @param {import('firebase-admin').firestore.CollectionReference} songsRef
 * @param {string} field
 * @param {string} q
 * @returns {Promise<import('firebase-admin').firestore.QuerySnapshot>}
 */
function prefixSearchByField(songsRef, field, q) {
  // '\uf8ff' is a very high Unicode character that acts as an upper-bound
  // for Firestore prefix queries — any string starting with `q` will be ≤ `q\uf8ff`.
  return songsRef
    .where(field, '>=', q)
    .where(field, '<=', q + '\uf8ff')
    .limit(10)
    .get();
}

/**
 * Read a comma-separated list of field names from env, with defaults.
 *
 * @param {string} envVarName
 * @param {string[]} fallback
 * @returns {string[]}
 */
function getSearchFields(envVarName, fallback) {
  const raw = process.env[envVarName];
  if (!raw) return fallback;

  const parsed = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}

/**
 * Normalize a Firestore document snapshot to the shape the bot expects.
 * Maps TuneX-specific field names to the bot's internal field names.
 *
 * @param {import('firebase-admin').firestore.DocumentSnapshot} doc
 * @returns {Object}
 */
function normalizeSong(doc) {
  const data = doc.data();
  const title = DEFAULT_TITLE_FIELDS
    .map((field) => data[field])
    .find((value) => typeof value === 'string' && value.trim().length > 0) || 'Desconocido';

  return {
    id: doc.id,
    ...data,
    title,
    // Map TuneX field names → bot field names.
    // `artistName` is the TuneX field; `artist` fallback covers any future migration.
    artist: data.artistName || data.artist || 'Desconocido',
    coverUrl: data.imageUrl || data.coverUrl || null,
  };
}

/**
 * Resolve a playable audio URL for a song document.
 * Prefers a stored `audioUrl` / `url` field; falls back to generating a
 * short-lived signed URL from Firebase Storage when only a `storagePath` is
 * present.
 *
 * @param {Object} song  Firestore document data
 * @returns {Promise<string>}
 */
async function getSongUrl(song) {
  if (song.audioUrl) return song.audioUrl;
  if (song.url) return song.url;
  if (song.downloadUrl) return song.downloadUrl;

  if (song.storagePath || song.storageRef) {
    const bucket = storage.bucket();
    const file = bucket.file(song.storagePath || song.storageRef);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    return url;
  }

  throw new Error('No audio URL found for this song.');
}

module.exports = { initFirebase, searchSongs, getSongUrl };
