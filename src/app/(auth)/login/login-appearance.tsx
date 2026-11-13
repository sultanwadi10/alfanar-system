"use client";
import { useCallback,useLayoutEffect,useSyncExternalStore,type ReactNode } from "react";
import { AlfanarIcon } from "@/components/admin/alfanar-icon";
import styles from "./login.module.css";
type Theme="light"|"dark";
const eventName="alfanar-login-theme-change",memory=new Map<string,Theme>();
export function LoginAppearance({target,children}:{target:"admin"|"store";children:ReactNode}){
 const key=target==="admin"?"alfanar-theme":"alfanar-store-theme";
 const read=useCallback(():Theme=>{
  const current=memory.get(key);if(current)return current;
  try{const saved=localStorage.getItem(key);if(saved==="light"||saved==="dark")return saved;}catch{}
  return memory.get(key)??(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
 },[key]);
 const subscribe=useCallback((listener:()=>void)=>{
  const media=window.matchMedia("(prefers-color-scheme: dark)");
  const storage=(event:StorageEvent)=>{if(event.key===key||event.key===null){if(event.isTrusted)memory.delete(key);listener();}};
  window.addEventListener(eventName,listener);window.addEventListener("storage",storage);media.addEventListener("change",listener);
  return()=>{window.removeEventListener(eventName,listener);window.removeEventListener("storage",storage);media.removeEventListener("change",listener);};
 },[key]);
 const theme=useSyncExternalStore(subscribe,read,()=>"dark" as Theme);
 useLayoutEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 function choose(mode:Theme){
  memory.set(key,mode);try{localStorage.setItem(key,mode);}catch{}
  document.documentElement.dataset.theme=mode;
  window.dispatchEvent(new Event(eventName));
  // Keep the existing store theme's in-memory preference in sync on this tab.
  window.dispatchEvent(new StorageEvent("storage",{key}));
 }
 return <main className={styles.page} dir="rtl" data-login-theme={theme}>
  <div className={styles.shell}>
   <header className={styles.topbar}>
    <p className={styles.mobileBrand}>محطة الفنار</p>
    <div className={styles.themeSwitch} role="group" aria-label="مظهر الصفحة">
     <button type="button" aria-label="الوضع الفاتح" aria-pressed={theme==="light"} onClick={()=>choose("light")}><AlfanarIcon name="sun" size={22}/></button>
     <button type="button" aria-label="الوضع الداكن" aria-pressed={theme==="dark"} onClick={()=>choose("dark")}><AlfanarIcon name="moon" size={22}/></button>
    </div>
   </header>
   <div className={styles.content}>
    <div className={styles.formArea}>{children}</div>
    <aside className={styles.brandPanel} aria-label="محطة الفنار">
     <div className={styles.brandName}>محطة الفنار</div>
     <svg className={styles.brandWave} viewBox="0 0 240 38" fill="none" aria-hidden="true"><path d="M4 26C63-23 136 66 234 6c-60 61-157-4-230 20Z" fill="currentColor"/></svg>
    </aside>
   </div>
   <div className={styles.waterArt} aria-hidden="true">
    <svg viewBox="0 0 1440 500" preserveAspectRatio="none" fill="none">
     <defs>
      <linearGradient id="login-wave-fill" x1="150" y1="120" x2="900" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#38bdf8" stopOpacity=".3"/><stop offset=".52" stopColor="#0879d9" stopOpacity=".2"/><stop offset="1" stopColor="#004f91" stopOpacity="0"/></linearGradient>
      <linearGradient id="login-wave-stroke" x1="0" y1="150" x2="1300" y2="300" gradientUnits="userSpaceOnUse"><stop stopColor="#a5edff" stopOpacity=".8"/><stop offset=".4" stopColor="#42b5fa" stopOpacity=".45"/><stop offset="1" stopColor="#1388ee" stopOpacity="0"/></linearGradient>
     </defs>
     <path d="M-50 174C184 9 229 321 466 242S704 128 938 267 1230 402 1500 229V500H-50Z" fill="url(#login-wave-fill)"/>
     <path d="M-50 174C184 9 229 321 466 242S704 128 938 267 1230 402 1500 229" stroke="url(#login-wave-stroke)" strokeWidth="2"/>
     <path d="M-50 185C165 35 228 345 473 259S715 153 935 282 1215 419 1500 245" stroke="url(#login-wave-stroke)" strokeWidth="1"/>
     <path d="M-50 195C170 64 241 354 477 275S717 182 939 298 1236 437 1500 258" stroke="url(#login-wave-stroke)" strokeWidth=".7"/>
     <path d="M-30 235C211 87 215 390 498 303S740 228 978 345 1262 458 1470 307" stroke="url(#login-wave-stroke)" strokeWidth=".6"/>
    </svg>
   </div>
  </div>
 </main>;
}
