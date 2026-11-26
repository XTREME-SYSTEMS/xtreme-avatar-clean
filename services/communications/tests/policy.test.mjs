import test from "node:test";
import assert from "node:assert/strict";
import { bearerMatches, normalizeTwilioAddress, safeMessageStatus, validateOutbound, verifyTwilioInputs } from "../policy.mjs";

test("private service bearer token requires exact match",()=>{
 assert.equal(bearerMatches("Bearer aaaaaaaa", "aaaaaaaa"),true);
 assert.equal(bearerMatches("Bearer aaaaaaab", "aaaaaaaa"),false);
 assert.equal(bearerMatches("Basic aaaaaaaa", "aaaaaaaa"),false);
 assert.equal(bearerMatches("Bearer aaaaaaaa", ""),false);
});
test("only valid E.164 and Twilio WhatsApp addresses are recognized",()=>{
 assert.deepEqual(normalizeTwilioAddress("+15551234567"),{channel:"sms",e164:"+15551234567"});
 assert.deepEqual(normalizeTwilioAddress("whatsapp:+15551234567"),{channel:"whatsapp",e164:"+15551234567"});
 for(const v of ["5551234567","whatsapp:5551234567","whatsapp:+000","web:+15551234567"]) assert.equal(normalizeTwilioAddress(v),null);
});
const base={
 workspaceId:"12345678-1234-1234-1234-123456789012",
 actorUserId:"user-abcdefgh",
 requestId:"abcdef12-1234-1234-1234-123456789012",
 to:"+15551234567",channel:"sms",body:"Test message",
};
test("send requires scoped identity request key and valid content",()=>{
 assert.ok(validateOutbound(base));
 assert.equal(validateOutbound({...base,actorUserId:"x"}),null);
 assert.equal(validateOutbound({...base,workspaceId:"cross-tenant"}),null);
 assert.equal(validateOutbound({...base,requestId:"different"}),null);
 assert.equal(validateOutbound({...base,channel:"whatsapp",to:"whatsapp:+15551234567"}),null);
 assert.equal(validateOutbound({...base,unexpected:true}),null);
});
test("MMS requires media from approved HTTPS path, no SSRF",()=>{
 const valid={...base,channel:"mms",mediaUrls:["https://www.xtremeavatar.com/media/invoice.png"]};
 assert.ok(validateOutbound(valid));
 for(const url of ["http://www.xtremeavatar.com/media/file","https://evil.example/media/a","https://www.xtremeavatar.com.evil.example/media/a","https://www.xtremeavatar.com/api/account","https://u:p@www.xtremeavatar.com/media/a","https://www.xtremeavatar.com:8443/media/a"]){
   assert.equal(validateOutbound({...valid,mediaUrls:[url]}),null,url);
 }
 assert.equal(validateOutbound({...base,channel:"sms",mediaUrls:valid.mediaUrls}),null);
});
test("Twilio inbound shape requires correct structured sender",()=>{
 const event={MessageSid:"SM"+"a".repeat(32),From:"+15551234567",To:"+15557654321"};
 assert.equal(verifyTwilioInputs(event),true);
 assert.equal(verifyTwilioInputs({...event,From:"whatsapp:+15551234567"}),false);
 assert.equal(verifyTwilioInputs({...event,MessageSid:"SM123"}),false);
});
test("only known carrier status codes are accepted",()=>{
 assert.equal(safeMessageStatus("delivered"),"delivered");
 assert.equal(safeMessageStatus("read"),"read");
 assert.equal(safeMessageStatus("received"),null);
});
