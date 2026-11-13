"use client";
import { receiveOperationChanges } from "@/lib/client/operation-changes";
import { type ReactNode, useEffect, useRef } from "react";

type StoreRuntimeWatchProps={children:ReactNode;initialOperatorEmployeeId?:string|null};
export function StoreRuntimeWatch({children,initialOperatorEmployeeId=null}:StoreRuntimeWatchProps){
 const operatorRef=useRef<string|null>(initialOperatorEmployeeId),exitingRef=useRef(false);
 useEffect(()=>{
  let cancelled=false,inFlight=false,nextCheckAt=0;
  let activeController:AbortController|null=null;
  const controller=new AbortController();
  async function forceStoreExit(){
   if(cancelled||exitingRef.current)return;
   exitingRef.current=true;
   try{await fetch("/api/auth/session/store/logout",{method:"POST",cache:"no-store",signal:controller.signal});}catch{}finally{if(!cancelled)window.location.replace("/");}
  }
  async function check(){
   if(cancelled||inFlight||exitingRef.current||document.visibilityState==="hidden"||Date.now()<nextCheckAt)return;
   inFlight=true;const requestController=new AbortController();activeController=requestController;
   const timeout=window.setTimeout(()=>requestController.abort(),10000);
   try{
    const response=await fetch("/api/pulse",{cache:"no-store",signal:requestController.signal});
    if(cancelled)return;
    if([401,403,423].includes(response.status)){await forceStoreExit();return;}
    if(!response.ok){nextCheckAt=Date.now()+60000;return;}
    nextCheckAt=0;
    const state=await response.json();
    if(cancelled||exitingRef.current||state.ok!==true)return;
    if(state.operatorEmployeeId!==null&&typeof state.operatorEmployeeId!=="string")return;
    const changed=operatorRef.current!==null&&operatorRef.current!==state.operatorEmployeeId;
    const protectedPage=window.location.pathname!=="/employee"&&window.location.pathname!=="/employee/";
    if(changed||(state.operatorEmployeeId===null&&protectedPage)){
     // Keep the paired store signed in. The server has already invalidated this operator.
     exitingRef.current=true;window.location.replace("/employee");return;
    }
    operatorRef.current=state.operatorEmployeeId;
    receiveOperationChanges(state.changes);
   }catch{ nextCheckAt=Date.now()+60000; /* A connection failure is not a successful session revocation. */ }
   finally{window.clearTimeout(timeout);activeController=null;inFlight=false;}
  }
  const operatorReady=(event:Event)=>{const employeeId=(event as CustomEvent<unknown>).detail;if(typeof employeeId==="string")operatorRef.current=employeeId;};
  const visible=()=>{if(document.visibilityState==="visible")void check();};
  const resume=()=>{void check();};
  void check();const timer=window.setInterval(resume,15000);
  window.addEventListener("alfanar:operator-ready",operatorReady);
  document.addEventListener("visibilitychange",visible);window.addEventListener("online",resume);window.addEventListener("focus",resume);
  return()=>{cancelled=true;controller.abort();activeController?.abort();window.clearInterval(timer);window.removeEventListener("alfanar:operator-ready",operatorReady);document.removeEventListener("visibilitychange",visible);window.removeEventListener("online",resume);window.removeEventListener("focus",resume);};
 },[]);
 return children;
}
