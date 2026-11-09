import test from "node:test";
import assert from "node:assert/strict";
import { createAdminPhotoProxy, AdminPhotoResponse } from "./adminPhotoProxy.js";
const input={uid:"u",catchId:"c",photoId:"p"};
const photo={type:"image/jpeg",cloud:{provider:"cloudinary",state:"synced",objectKey:"users/u/catches/c/photos/p/original",sha256:"a".repeat(64)}};
const jpeg=new Uint8Array([255,216,255,225,0,4,77,88,255,218,0,2,33,255,217]);
test("support photo proxy reuses authenticated delivery, strips metadata and returns no signed URL", async()=>{
  let calls=0;
  const proxy=createAdminPhotoProxy({sdk:async()=>({utils:{private_download_url:(id,format,options)=>{assert.equal(format,"jpg");assert.equal(options.type,"authenticated");return "https://api.cloudinary.com/private-fixture";}}}),fetchImpl:async(url,options)=>{calls++;assert.equal(options.redirect,"error");return new Response(jpeg,{headers:{"content-type":"image/jpeg"}});}});
  const result=await proxy(input,photo);assert.ok(result instanceof AdminPhotoResponse);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/cloudinary|http/);assert.deepEqual([...result.bytes],[255,216,255,218,0,2,33,255,217]);
});
test("unsupported or mismatched photo metadata fails before delivery and oversized/invalid bodies are rejected",async()=>{
  const sdk=async()=>({utils:{private_download_url:()=>"https://api.cloudinary.com/private-fixture"}});
  const never=createAdminPhotoProxy({sdk,fetchImpl:async()=>assert.fail("No delivery allowed")});
  for(const p of [{...photo,type:"image/png"},{...photo,cloud:{...photo.cloud,objectKey:"users/other/private"}},{...photo,cloud:{...photo.cloud,state:"pending"}}])await assert.rejects(never(input,p));
  const oversized=createAdminPhotoProxy({sdk,fetchImpl:async()=>new Response(jpeg,{headers:{"content-type":"image/jpeg","content-length":"2000001"}})});await assert.rejects(oversized(input,photo));
  const invalid=createAdminPhotoProxy({sdk,fetchImpl:async()=>new Response(new Uint8Array([1,2]),{headers:{"content-type":"image/jpeg"}})});await assert.rejects(invalid(input,photo));
});
