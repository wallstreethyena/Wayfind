"use client";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

export function FoodFilters() {
  const [active, setActive] = useState("all");
  useEffect(() => {
    function showAll() {
      document.querySelectorAll("[data-universal-food-table] tbody tr").forEach(row => { row.hidden = false; });
      setActive("all");
    }
    // A map card or any link that jumps to a food row hidden by the filter
    // shows every row again, then brings the row into view.
    function revealHashTarget() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      const row = target?.closest("[data-universal-food-table] tbody tr");
      if (!row || !row.hidden) return;
      showAll();
      requestAnimationFrame(() => target.scrollIntoView?.({ block: "start" }));
    }
    // hashchange does not fire for a link to the hash already in the address
    // bar, so same-page link clicks are checked too (after navigation).
    function onClick(event) {
      if (event.target?.closest?.('a[href^="#"]')) requestAnimationFrame(revealHashTarget);
    }
    window.addEventListener("hashchange", revealHashTarget);
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener("hashchange", revealHashTarget); document.removeEventListener("click", onClick); };
  }, []);
  useEffect(() => {
    document.querySelectorAll("[data-universal-food-table] tbody tr").forEach(row => {
      const park = row.dataset.park;
      row.hidden = active !== "all" && park !== active;
    });
  }, [active]);
  return <div className={styles.foodFilters} aria-label="Filter food by park">{[["all", "All parks"], ["islands", "Islands"], ["studios", "Studios"], ["epic", "Epic"]].map(([id, title]) => <button key={id} type="button" aria-pressed={active === id} onClick={() => setActive(id)}>{title}</button>)}</div>;
}
