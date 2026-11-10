import { useEffect, useRef, useState } from "react";
import { requestWaterPosition } from "../data/waterLocation.js";

export function useWaterPosition() {
  const [state,setState]=useState({status:"idle",evidence:null,error:""}), alive=useRef(false), pending=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const request=async()=>{
    if(pending.current)return null;
    pending.current=true;setState({status:"loading",evidence:null,error:""});
    try {const evidence=await requestWaterPosition();if(alive.current)setState({status:"ready",evidence,error:""});return alive.current ? evidence : null;}
    catch(error){if(alive.current)setState({status:error.code === "denied" ? "denied" : "error",evidence:null,error:error.message});return null;}
    finally {pending.current=false;}
  };
  return {...state,request};
}
