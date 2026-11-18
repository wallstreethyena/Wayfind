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
    document.addEventListener("universal-guide-jump", showAll);
    return () => document.removeEventListener("universal-guide-jump", showAll);
  }, []);
  useEffect(() => {
    document.querySelectorAll("[data-universal-food-table] tbody tr").forEach(row => {
      const park = row.dataset.park;
      row.hidden = active !== "all" && park !== active;
    });
  }, [active]);
  return <div className={styles.foodFilters} aria-label="Filter food by park">{[["all", "All parks"], ["islands", "Islands"], ["studios", "Studios"], ["epic", "Epic"]].map(([id, title]) => <button key={id} type="button" aria-pressed={active === id} onClick={() => setActive(id)}>{title}</button>)}</div>;
}
