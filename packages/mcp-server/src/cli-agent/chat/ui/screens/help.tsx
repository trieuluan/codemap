/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import { Color } from "terminui";
import { Label, VStack } from "terminui/jsx";
import { fgStyle, boldFgStyle } from "../blocks/helpers.js";

export function HelpScreen() {
  return (
    <VStack>
      <Label text="" />
      <Label style={boldFgStyle(Color.Cyan)} text="  CODEMAP — Commands" />
      <Label text="" />
      <Label style={fgStyle(Color.White)} text="  Chat" />
      <Label style={fgStyle(Color.DarkGray)} text="    Type naturally to chat with the AI agent" />
      <Label text="" />
      <Label style={fgStyle(Color.White)} text="  Model" />
      <Label style={fgStyle(Color.Green)} text="    /model              Switch AI model" />
      <Label style={fgStyle(Color.Green)} text="    /model <name>       Switch to specific model" />
      <Label text="" />
      <Label style={fgStyle(Color.White)} text="  Mode" />
      <Label style={fgStyle(Color.Yellow)} text="    /mode               Change gateway mode" />
      <Label style={fgStyle(Color.DarkGray)} text="    local-only          No cloud calls" />
      <Label style={fgStyle(Color.DarkGray)} text="    ask-before-cloud    Confirm before cloud" />
      <Label style={fgStyle(Color.DarkGray)} text="    cloud-ok            Allow cloud calls" />
      <Label style={fgStyle(Color.DarkGray)} text="    hybrid              Best of both" />
      <Label text="" />
      <Label style={fgStyle(Color.White)} text="  Tools" />
      <Label style={fgStyle(Color.Cyan)} text="    /retry              Resend last message" />
      <Label style={fgStyle(Color.Cyan)} text="    /clear              Clear message history" />
      <Label text="" />
      <Label style={fgStyle(Color.White)} text="  Other" />
      <Label style={fgStyle(Color.Magenta)} text="    /debug              Toggle debug logging" />
      <Label style={fgStyle(Color.Magenta)} text="    /exit               Quit CodeMap" />
      <Label text="" />
      <Label style={fgStyle(Color.DarkGray)} text="  Press any key to return..." />
    </VStack>
  );
}
