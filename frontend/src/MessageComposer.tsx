import React from 'react';
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react";

interface MessageComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  composerMedia: { type: string; mediaUrl: string; mediaName: string; mediaMime: string } | null;
  onClearMedia: () => void;
  onSendMessage: () => void;
  onAttachFile: (file: File | undefined) => Promise<void>;
  onToggleEmoji: () => void;
  onToggleVoice: () => void;
  showEmojiPicker: boolean;
  isRecording: boolean;
  sending?: boolean;
  addEmoji: (emojiData: EmojiClickData) => void;
}

export function MessageComposer({
  text, 
  onTextChange, 
  composerMedia, 
  onClearMedia,
  onSendMessage, 
  onAttachFile, 
  onToggleEmoji, 
  onToggleVoice, 
  showEmojiPicker, 
  isRecording, 
  sending = false,
  addEmoji 
}: MessageComposerProps) {
  return (
    <>
      {composerMedia && (
        <div className="mediaPreviewBar">
          <div className="cardText">
            <strong>{composerMedia.mediaName || composerMedia.type}</strong>
            <span>{composerMedia.type} ready to send</span>
          </div>
          <button className="ghostBtn smallGhost" onClick={onClearMedia}>Remove</button>
        </div>
      )}
      {showEmojiPicker && (
        <div className="emojiWrap">
          <EmojiPicker onEmojiClick={addEmoji} lazyLoadEmojis searchDisabled skinTonesDisabled />
        </div>
      )}
      <div className="composerBar">
        <div className="composerTools">
          <button className={`ghostBtn smallGhost composerIcon composerAction ${showEmojiPicker ? 'composerActionActive' : ''}`} onClick={onToggleEmoji}>
            <span className="composerGlyph" aria-hidden="true">☺</span>
            <span className="composerActionText">
              <strong>Emoji</strong>
              <small>Reactions</small>
            </span>
          </button>
          <label className="ghostBtn smallGhost composerIcon composerAction">
            <span className="composerGlyph" aria-hidden="true">+</span>
            <span className="composerActionText">
              <strong>Media</strong>
              <small>Photo or file</small>
            </span>
            <input 
              className="hiddenInput" 
              type="file" 
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip" 
              onChange={(e) => onAttachFile(e.target.files?.[0])} 
            />
          </label>
          <button 
            className={isRecording ? "primaryBtn smallGhost composerIcon composerAction composerActionActive" : "ghostBtn smallGhost composerIcon composerAction"} 
            onClick={onToggleVoice}
          >
            <span className="composerGlyph" aria-hidden="true">{isRecording ? '■' : '◉'}</span>
            <span className="composerActionText">
              <strong>{isRecording ? 'Stop Mic' : 'Voice Note'}</strong>
              <small>{isRecording ? 'Save recording' : 'Hold your idea'}</small>
            </span>
          </button>
        </div>
        <div className="composerInputRow">
          <input 
            className="input" 
            value={text} 
            onChange={(e) => onTextChange(e.target.value)} 
            placeholder={isRecording ? "Recording voice note..." : "Write a message"} 
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSendMessage()}
          />
          <button className="primaryBtn composerSend" onClick={onSendMessage} disabled={sending}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </>
  );
}
