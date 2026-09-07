import React from 'react';
import type { Message, CallLog, User } from './types';
import { fmtTime, fmtDate } from './utils';

interface MessageListProps {
  /** Messages to display */
  messages: Message[];
  /** Call logs to display */
  calls: CallLog[];
  /** Current user for distinguishing own messages */
  currentUser: User | null;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when message is clicked (for actions) */
  onMessageAction?: (message: Message, action: 'react' | 'reply' | 'delete') => void;
}

interface TimelineBlock {
  kind: 'date' | 'message-group' | 'call';
  id: string;
  label?: string;
  messages?: Message[];
  call?: CallLog;
  mine?: boolean;
  senderName?: string;
}

/**
 * MessageList component displays a conversation timeline
 * Organizes messages and calls chronologically with date separators
 * Groups consecutive messages from the same sender
 */
export function MessageList({
  messages,
  calls,
  currentUser,
  isLoading = false,
  onMessageAction,
}: MessageListProps) {
  // Memoize timeline blocks to avoid recalculation
  const timelineBlocks = React.useMemo(() => {
    const items: Array<{ kind: string; createdAt: string; id: string; message?: Message; call?: CallLog }> = [];

    messages.forEach((msg) => items.push({ kind: 'message', createdAt: msg.createdAt, id: msg.id, message: msg }));
    calls.forEach((call) => items.push({ kind: 'call', createdAt: call.createdAt, id: call.id, call }));

    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const blocks: TimelineBlock[] = [];
    let lastDate = '';

    items.forEach((item) => {
      const itemDate = new Date(item.createdAt).toLocaleDateString();

      if (itemDate !== lastDate) {
        blocks.push({ kind: 'date', id: `date-${itemDate}`, label: itemDate });
        lastDate = itemDate;
      }

      if (item.kind === 'call') {
        blocks.push({ kind: 'call', id: item.id, call: item.call });
      } else {
        // Group consecutive messages from same sender
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.kind === 'message-group' && lastBlock.mine === (item.message?.sender.id === currentUser?.id)) {
          if (lastBlock.messages) lastBlock.messages.push(item.message!);
        } else {
          blocks.push({
            kind: 'message-group',
            id: `group-${item.id}`,
            messages: [item.message!],
            mine: item.message?.sender.id === currentUser?.id,
            senderName: item.message?.sender.name,
          });
        }
      }
    });

    return blocks;
  }, [messages, calls, currentUser]);

  if (isLoading) {
    return <div className="messageListLoader">Loading messages...</div>;
  }

  if (messages.length === 0 && calls.length === 0) {
    return <div className="messageListEmpty">No messages yet. Start the conversation!</div>;
  }

  return (
    <div className="messageList">
      {timelineBlocks.map((block) => {
        if (block.kind === 'date') {
          return (
            <div key={block.id} className="messageDateSeparator">
              <span>{fmtDate(block.label || new Date().toISOString())}</span>
            </div>
          );
        }

        if (block.kind === 'call') {
          const call = block.call!;
          return (
            <div key={block.id} className="messageCall">
              <div className="callBubble">
                <span className="callIcon">{call.mode === 'video' ? '📹' : '📞'}</span>
                <div className="callDetail">
                  <span>{call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} {call.mode} call</span>
                  {call.status === 'completed' && call.durationSeconds ? (
                    <span className="callDuration">
                      {Math.floor(call.durationSeconds / 60)}m {call.durationSeconds % 60}s
                    </span>
                  ) : (
                    <span className="callStatus">{call.status}</span>
                  )}
                  <time>{fmtTime(call.createdAt)}</time>
                </div>
              </div>
            </div>
          );
        }

        // Message group
        return (
          <div key={block.id} className={`messageGroup ${block.mine ? 'messageGroupMine' : 'messageGroupTheirs'}`}>
            {block.messages?.map((msg) => (
              <div key={msg.id} className={`messageBubble ${msg.type !== 'text' ? `messageBubble-${msg.type}` : ''}`}>
                {msg.type === 'text' ? (
                  <p>{msg.text}</p>
                ) : msg.type === 'image' ? (
                  <img src={msg.mediaUrl || ''} alt={msg.mediaName || 'Image'} className="messageMedia" />
                ) : msg.type === 'video' ? (
                  <video controls className="messageMedia">
                    <source src={msg.mediaUrl || ''} type={msg.mediaMime || 'video/mp4'} />
                  </video>
                ) : msg.type === 'audio' ? (
                  <audio controls className="messageAudio">
                    <source src={msg.mediaUrl || ''} type={msg.mediaMime || 'audio/mpeg'} />
                  </audio>
                ) : (
                  <a href={msg.mediaUrl || '#'} className="messageFile">
                    📎 {msg.mediaName || 'Attachment'}
                  </a>
                )}
                <div className="messageMeta">
                  <time className="messageTime">{fmtTime(msg.createdAt)}</time>
                  {msg.receipt && (
                    <span className="messageReceipt" title={msg.receipt.status}>
                      {msg.receipt.status === 'read' ? '✓✓' : msg.receipt.status === 'delivered' ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export type { MessageListProps };
