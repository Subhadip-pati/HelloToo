import React from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';

interface MessageComposerProps {
  /** Current message text */
  text: string;
  /** Callback when text changes */
  onTextChange: (text: string) => void;
  /** Attached media file data */
  composerMedia: { type: string; mediaUrl: string; mediaName: string; mediaMime: string } | null;
  /** Callback to clear attached media */
  onClearMedia: () => void;
  /** Callback to send message */
  onSendMessage: () => void;
  /** Callback when file is attached */
  onAttachFile: (file: File | undefined) => Promise<void>;
  /** Callback to toggle emoji picker */
  onToggleEmoji: () => void;
  /** Callback to toggle voice recording */
  onToggleVoice: () => void;
  /** Whether emoji picker is visible */
  showEmojiPicker: boolean;
  /** Whether voice recording is active */
  isRecording: boolean;
  /** Whether message is being sent */
  sending?: boolean;
  /** Callback when emoji is selected */
  addEmoji: (emojiData: EmojiClickData) => void;
}

/**
 * MessageComposer component provides message input with attachments, emoji, and voice
 * Handles text input, media preview, and sending with various content types
 */
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
        <div className="composerInputRow">
          <button
            type="button"
            className={`ghostBtn smallGhost composerRoundBtn ${showEmojiPicker ? 'composerRoundBtn-active' : ''}`}
            onClick={onToggleEmoji}
            aria-label="Toggle emoji picker"
          >
            :)
          </button>
          <label className="ghostBtn smallGhost composerRoundBtn composerAttachBtn" aria-label="Attach media">
            +
            <input
              className="hiddenInput"
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
              onChange={(e) => onAttachFile(e.target.files?.[0])}
            />
          </label>
          <input
            className="input"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={isRecording ? "Recording voice note..." : "Type a message"}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSendMessage()}
          />
          <button
            type="button"
            className={isRecording ? "primaryBtn composerMicBtn composerMicBtn-active" : "ghostBtn smallGhost composerMicBtn"}
            onClick={onToggleVoice}
            aria-label={isRecording ? 'Stop voice recording' : 'Record voice note'}
          >
            {isRecording ? 'Stop' : 'Mic'}
          </button>
          <button className="primaryBtn composerSend" onClick={onSendMessage} disabled={sending} aria-label="Send message">
            {sending ? '...' : '>'}
          </button>
        </div>
      </div>
    </>
  );
}

export type { MessageComposerProps };
