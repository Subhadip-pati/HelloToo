import React from 'react';
import type { Chat, User } from './types';
import { fmtTime, initials } from './utils';

interface ChatListProps {
  /** Array of chats to display */
  chats: Chat[];
  /** Search filter text */
  search: string;
  /** Currently active chat ID */
  activeChatId: string;
  /** Callback when a chat is selected */
  onChatSelect: (chatId: string) => void;
  /** Count of registered contacts */
  registeredContactsLength: number;
}

function Avatar({ name, avatarUrl, group = false, size = 46 }: { name: string; avatarUrl?: string | null; group?: boolean; size?: number }) {
  const sizeClass = `avatarSize${Math.max(24, Math.min(96, size))}`;
  const baseClass = group ? 'avatar groupAvatar' : 'avatar';
  if (avatarUrl) {
    return <img className={`${baseClass} ${sizeClass}`} src={avatarUrl} alt={name} />;
  }
  return <div className={`${baseClass} avatarFallback ${sizeClass}`}>{group ? 'GR' : initials(name)}</div>;
}

/**
 * ChatList component displays a filterable list of conversations
 * Shows chat statistics and renders each chat with unread indicators
 */
export function ChatList({ chats, search, activeChatId, onChatSelect, registeredContactsLength }: ChatListProps) {
  const filteredChats = React.useMemo(() => 
    chats.filter((chat) => chat.title.toLowerCase().includes(search.toLowerCase())),
    [chats, search]
  );

  return (
    <div>
      <div className="sectionTop">
        <h2>Chats</h2>
        <input className="input searchInput" placeholder="Search chats" value={search} readOnly />
      </div>
      <div className="miniHero">
        <div>
          <strong>{filteredChats.length}</strong>
          <span>active chats</span>
        </div>
        <div>
          <strong>{registeredContactsLength}</strong>
          <span>ready contacts</span>
        </div>
        <div>
          <strong>{chats.filter((chat) => chat.isGroup).length}</strong>
          <span>groups</span>
        </div>
      </div>
      <div className="chatList">
        {filteredChats.map((chat) => (
          <button 
            key={chat.id} 
            className={chat.id === activeChatId ? "chatCard activeCard" : "chatCard"} 
            onClick={() => onChatSelect(chat.id)}
          >
            <div className="rowStart">
              <Avatar 
                name={chat.title} 
                avatarUrl={chat.avatarUrl} 
                group={chat.isGroup}
                size={46}
              />
              <div className="cardText">
                <strong>{chat.title}</strong>
                <span>{chat.isGroup ? `${chat.members?.length || 0} members` : ''}</span>
              </div>
            </div>
            <div className="cardMeta">
              <span>{chat.lastMessage ? fmtTime(chat.lastMessage.createdAt) : ""}</span>
              <div className="chatMetaLine">
                <p>{chat.lastMessage?.text || "Start chatting"}</p>
                {chat.unreadCount ? <span className="unreadBadge">{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { ChatListProps };
