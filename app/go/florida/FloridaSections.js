'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './florida.module.css';

const STORAGE_KEY = 'wayfind:florida:sections:v1';
export default function FloridaSections({ sections }) {
  const [open, setOpen] = useState(() => Object.fromEntries(sections.map(section => [section.id, true])));
  const [active, setActive] = useState('');
  const [ready, setReady] = useState(false);
  const menu = useRef(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') setOpen(previous => Object.fromEntries(sections.map(({ id }) => [id, typeof saved[id] === 'boolean' ? saved[id] : previous[id]])));
    } catch { /* Browsing still works when storage is unavailable. */ }
    const select = key => {
      setOpen(Object.fromEntries(sections.map(section => [section.id, section.id === key])));
      setActive(key);
      requestAnimationFrame(() => {
        const panel = document.getElementById(`accordion-${key}`);
        panel?.scrollIntoView({ block: 'start' });
      });
    };
    const selectHash = () => {
      const key = window.location.hash.slice(1);
      if (sections.some(section => section.id === key)) select(key);
    };
    const onClick = event => {
      const link = event.target.closest('a[href^="#"]');
      const key = link?.getAttribute('href').slice(1);
      if (!sections.some(section => section.id === key)) return;
      event.preventDefault();
      window.history.pushState(window.history.state, '', `#${key}`);
      select(key);
    };
    selectHash();
    setReady(true);
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', selectHash);
    window.addEventListener('popstate', selectHash);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', selectHash);
      window.removeEventListener('popstate', selectHash);
    };
  }, [sections]);
  useEffect(() => {
    if (ready) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(open)); } catch {}
  }, [open, ready]);
  useEffect(() => {
    const selected = menu.current?.querySelector('[aria-current="true"]');
    if (selected) menu.current.scrollLeft = selected.offsetLeft - menu.current.offsetLeft - 12;
  }, [active]);
  function toggle(id) {
    setOpen(previous => ({ ...previous, [id]: !previous[id] }));
    // A manual layout takes precedence over an old section deep link on return.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setActive('');
  }
  return <>
    <nav ref={menu} className={styles.sectionMenu} aria-label="Explore Florida by interest">
      {sections.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? 'true' : undefined} aria-controls={`panel-${section.id}`}>{section.label}</a>)}
    </nav>
    <div className={styles.content}>{sections.map(section => <div key={section.id} id={`accordion-${section.id}`} className={styles.accordion}>
      <h2 className={styles.accordionHeading}><button type="button" id={`heading-${section.id}`} aria-expanded={open[section.id]} aria-controls={`panel-${section.id}`} onClick={() => toggle(section.id)}><span>{section.title}</span><span aria-hidden="true">{open[section.id] ? '−' : '+'}</span></button></h2>
      <div id={`panel-${section.id}`} role="region" aria-labelledby={`heading-${section.id}`} hidden={!open[section.id]}>{section.content}</div>
    </div>)}</div>
  </>;
}
