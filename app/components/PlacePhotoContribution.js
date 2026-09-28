"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { isNative, nativePickPhoto } from "../../lib/native";

const MAX_PHOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = "user-media";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function cleanName(name) {
  return String(name || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80) || "photo";
}

function objectPath(userId, placeId, file, index) {
  const rand = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${userId}/places/${encodeURIComponent(String(placeId))}/${Date.now()}-${index}-${rand}-${cleanName(file.name)}`;
}

function fileOkay(file) {
  if (!file || !ALLOWED.has(String(file.type || "").toLowerCase())) return "Use a JPG, PNG, WebP, HEIC, or HEIF photo.";
  if (Number(file.size || 0) <= 0 || Number(file.size || 0) > MAX_BYTES) return "Each photo must be 8 MB or smaller.";
  return "";
}

export default function PlacePhotoContribution({ place, user, authReady = false, setAuthOpen, showToast, logEvent }) {
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [relationship, setRelationship] = useState("visitor");
  const [note, setNote] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);

  const placeId = String(place?.id || place?.place_id || "");
  const placeName = String(place?.name || "this place");

  useEffect(() => {
    let live = true;
    if (!supabase || !user?.id || !placeId) { setPendingCount(0); return () => { live = false; }; }
    supabase
      .from("wf_user_media")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("target_type", "place")
      .eq("target_id", placeId)
      .eq("media_type", "photo")
      .eq("status", "pending")
      .then(({ count }) => { if (live) setPendingCount(Number(count || 0)); })
      .catch(() => {});
    return () => { live = false; };
  }, [user?.id, placeId, done]);

  function addFiles(list) {
    const next = [];
    for (const file of Array.from(list || [])) {
      if (files.length + next.length >= MAX_PHOTOS) break;
      const why = fileOkay(file);
      if (why) { setError(why); continue; }
      next.push(file);
    }
    if (next.length) {
      setFiles((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
      setError("");
      setDone(false);
    }
  }

  async function pickNative() {
    const file = await nativePickPhoto({ source: "PROMPT" });
    if (file) addFiles([file]);
  }

  async function submit() {
    if (!authReady || !user?.id) {
      try { setAuthOpen?.(true); } catch {}
      return;
    }
    if (!placeId) return setError("This place is missing an ID.");
    if (!files.length) return setError("Add at least one photo.");
    if (!rights) return setError("Please confirm you have permission to share these photos.");
    if (!supabase) return setError("Uploads are unavailable right now.");

    setBusy(true);
    setError("");
    const uploaded = [];
    try {
      const rows = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const path = objectPath(user.id, placeId, file, i);
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: false,
          contentType: file.type || "image/jpeg",
          cacheControl: "3600",
        });
        if (uploadError) throw new Error(uploadError.message || "Photo upload failed");
        uploaded.push(path);
        rows.push({
          user_id: user.id,
          target_type: "place",
          target_id: placeId,
          media_type: "photo",
          storage_path: path,
          mime_type: file.type || null,
          bytes: Number(file.size || 0) || null,
          caption: note.trim().slice(0, 500) || null,
          status: "pending",
          moderation: {
            submission: {
              rights_attested: true,
              relationship,
              submitted_for: placeName.slice(0, 200),
              terms_version: "place-photo-contribution-v1",
            },
          },
        });
      }

      const { error: insertError } = await supabase.from("wf_user_media").insert(rows);
      if (insertError) throw new Error(insertError.message || "Submission failed");

      setFiles([]);
      setNote("");
      setRights(false);
      setDone(true);
      setPendingCount((n) => n + rows.length);
      try { showToast?.("Photos sent to Wayfind for review"); } catch {}
      try { logEvent?.("place_photo_contribution_submitted", place, { count: rows.length, relationship }); } catch {}
    } catch (e) {
      if (uploaded.length) {
        try { await supabase.storage.from(BUCKET).remove(uploaded); } catch {}
      }
      setError(String(e?.message || "Could not submit photos. Please try again.").slice(0, 180));
    } finally {
      setBusy(false);
    }
  }

  if (!placeId) return null;

  return (
    <section data-place-photo-contribution style={{ marginBottom: 14, border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, background: "linear-gradient(145deg, rgba(255,122,24,.07), rgba(18,22,29,.96))", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => {
          if (authReady && !user) { try { setAuthOpen?.(true); } catch {} return; }
          setOpen((v) => !v);
          try { logEvent?.("place_photo_contribution_open", place, {}); } catch {}
        }}
        style={{ width: "100%", border: 0, background: "transparent", color: "#F8FAFC", padding: "14px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", textAlign: "left" }}
      >
        <span>
          <span style={{ display: "block", fontSize: 10, fontWeight: 900, letterSpacing: "1.1px", textTransform: "uppercase", color: "#FF7A18", marginBottom: 4 }}>Help improve this place</span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 850 }}>Have a better photo of {placeName}?</span>
          <span style={{ display: "block", fontSize: 11.5, color: "#94A3B8", marginTop: 3 }}>Send the real place. Wayfind reviews it before anything changes.</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 20, color: "#94A3B8" }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 15px 15px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          {pendingCount > 0 && <div style={{ marginTop: 12, fontSize: 11.5, color: "#A7F3D0" }}>{pendingCount} photo{pendingCount === 1 ? "" : "s"} already waiting for review.</div>}
          <div style={{ marginTop: 12, fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>
            Upload up to {MAX_PHOTOS} photos you took or have permission to share. Approved photos may appear on Wayfind for this exact place.
          </div>

          <label style={{ display: "block", marginTop: 12, fontSize: 11, fontWeight: 800, color: "#CBD5E1" }}>I am</label>
          <select value={relationship} onChange={(e) => setRelationship(e.target.value)} style={{ width: "100%", marginTop: 6, padding: "10px 11px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "#111827", color: "#F8FAFC", fontSize: 13 }}>
            <option value="visitor">A visitor / customer</option>
            <option value="owner">The owner</option>
            <option value="team">Part of the business team</option>
            <option value="creator">A creator / photographer</option>
            <option value="other">Other</option>
          </select>

          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" disabled={files.length >= MAX_PHOTOS || busy} onClick={() => isNative() ? pickNative() : inputRef.current?.click()} style={{ minHeight: 40, padding: "9px 13px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.04)", color: "#F8FAFC", fontSize: 12.5, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
              📷 Add photos
            </button>
            {files.length > 0 && <span style={{ alignSelf: "center", fontSize: 11.5, color: "#94A3B8" }}>{files.length} / {MAX_PHOTOS} selected</span>}
          </div>

          {files.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {files.map((file, i) => (
                <button key={file.name + i} type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} title="Remove photo" style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, background: "rgba(255,255,255,.04)", color: "#CBD5E1", padding: "7px 9px", maxWidth: "100%", fontSize: 10.5, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.name} ×
                </button>
              ))}
            </div>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Optional note for the Wayfind reviewer" style={{ width: "100%", boxSizing: "border-box", marginTop: 12, resize: "vertical", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "#111827", color: "#F8FAFC", padding: "10px 11px", fontSize: 13, fontFamily: "inherit" }} />

          <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, color: "#CBD5E1", fontSize: 11.5, lineHeight: 1.45, cursor: "pointer" }}>
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ marginTop: 2 }} />
            <span>I took these photos or I have permission to let Wayfind display them. I understand Wayfind reviews submissions before publishing.</span>
          </label>

          {error && <div role="alert" style={{ marginTop: 10, color: "#FCA5A5", fontSize: 11.5 }}>{error}</div>}
          {done && <div style={{ marginTop: 10, color: "#A7F3D0", fontSize: 11.5, fontWeight: 700 }}>Sent. Nothing on the place card changes until Wayfind approves a photo.</div>}

          <button type="button" onClick={submit} disabled={busy || !files.length || !rights} style={{ width: "100%", minHeight: 44, marginTop: 12, border: 0, borderRadius: 12, background: busy || !files.length || !rights ? "#374151" : "#FF7A18", color: busy || !files.length || !rights ? "#94A3B8" : "#0D1117", fontSize: 13.5, fontWeight: 900, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Sending photos…" : "Send photos for review"}
          </button>
        </div>
      )}
    </section>
  );
}
