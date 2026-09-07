import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Avatar } from './App';
import { useApp } from './AppContext';
import './index.css';

type ContactPickerContact = {
  name?: string[];
  tel?: string[];
  email?: string[];
};

type DiscoverUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  statusText: string;
};

type LookupResult = {
  user: DiscoverUser | null;
  existingContact: boolean;
  existingRequest: null | { id: string; status: string; direction: 'incoming' | 'outgoing' };
};

type LocalStatus = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
  mine?: boolean;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  linkUrl?: string | null;
};

type ReportTarget = {
  requestId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  phoneNumber?: string | null;
  aliasName?: string | null;
} | null;

const reportReasons = [
  'Spam messages',
  'Fraud or scam',
  'Abusive behaviour',
  'Unwanted messages',
  'Fake profile',
] as const;

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export function ContactsPane({ section }: { section: string }) {
  const { contacts, setContacts, setChats, setActiveChatId, token, api, setInfo, setError, incomingRequests, refreshIncomingRequests, respondToIncomingRequest, saveConnectionRecordFromUser, connectionRecords, me, isMobile } = useApp();
  const [mobileContactsView, setMobileContactsView] = useState<'people' | 'status' | 'add' | 'discover'>(
    section === 'updates' ? 'status' : 'people',
  );
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverUsers, setDiscoverUsers] = useState<DiscoverUser[]>([]);
  const [contactForm, setContactForm] = useState({ name: '', phoneNumber: '', email: '', avatarUrl: '' });
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [statusLink, setStatusLink] = useState('');
  const [statusMediaUrl, setStatusMediaUrl] = useState<string | null>(null);
  const [statusMediaType, setStatusMediaType] = useState<'image' | 'video' | null>(null);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const [statuses, setStatuses] = useState<LocalStatus[]>([]);
  const [viewedStatusIds, setViewedStatusIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('helloto_viewed_status_ids');
      return saved ? JSON.parse(saved) as string[] : [];
    } catch {
      return [];
    }
  });
  const contactPickerSupported =
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof (navigator as Navigator & {
      contacts?: { select: (properties: string[], options?: { multiple?: boolean }) => Promise<ContactPickerContact[]> };
    }).contacts?.select === 'function';

  const blockedUserIds = useMemo(
    () => new Set(connectionRecords.filter((record) => record.disposition === 'blocked').map((record) => record.userId)),
    [connectionRecords],
  );
  const visibleContacts = useMemo(
    () => contacts.filter((contact) => {
      const contactUserId = contact.registeredUser?.id ?? contact.id;
      return !blockedUserIds.has(contactUserId);
    }),
    [blockedUserIds, contacts],
  );
  const registeredContacts = useMemo(() => visibleContacts.filter((contact) => contact.registeredUser), [visibleContacts]);
  const liveStatuses = useMemo(
    () => statuses
      .filter((status) => Date.now() - new Date(status.createdAt).getTime() < STATUS_TTL_MS)
      .sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt)),
    [statuses],
  );
  const myStatus = useMemo(() => liveStatuses.find((status) => status.mine) ?? null, [liveStatuses]);
  const recentStatuses = useMemo(
    () => liveStatuses.filter((status) => !status.mine && !viewedStatusIds.includes(status.id)),
    [liveStatuses, viewedStatusIds],
  );
  const viewedStatuses = useMemo(
    () => liveStatuses.filter((status) => !status.mine && viewedStatusIds.includes(status.id)),
    [liveStatuses, viewedStatusIds],
  );
  const activeStatus = useMemo(
    () => liveStatuses.find((status) => status.id === activeStatusId) ?? myStatus ?? recentStatuses[0] ?? viewedStatuses[0] ?? null,
    [activeStatusId, liveStatuses, myStatus, recentStatuses, viewedStatuses],
  );
  const showingStatusScreen = section === 'updates' || mobileContactsView === 'status';

  useEffect(() => {
    setMobileContactsView(section === 'updates' ? 'status' : 'people');
  }, [section]);

  useEffect(() => {
    if (section === 'contacts' && token) {
      void refreshIncomingRequests().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [section, token, refreshIncomingRequests, setError]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('helloto_viewed_status_ids', JSON.stringify(viewedStatusIds));
  }, [viewedStatusIds]);

  const refreshStatuses = async () => {
    if (!token) return;
    const res = await api<{ statuses: LocalStatus[] }>('/statuses', { token });
    setStatuses(res.statuses);
  };

  useEffect(() => {
    if (!token) {
      setStatuses([]);
      return;
    }
    refreshStatuses().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (section !== 'updates' && mobileContactsView !== 'status') return;

    const refresh = () => {
      refreshStatuses().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    };

    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [mobileContactsView, section, token]);

  const resetStatusComposer = () => {
    setStatusText('');
    setStatusLink('');
    setStatusMediaUrl(null);
    setStatusMediaType(null);
  };

  const normalizeStatusLink = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  const readStatusMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
    if (!mediaType) {
      setInfo('Choose an image or video file for status.');
      event.target.value = '';
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read selected media'));
      reader.readAsDataURL(file);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
      return '';
    });

    if (!dataUrl) return;
    setStatusMediaUrl(dataUrl);
    setStatusMediaType(mediaType);
    event.target.value = '';
  };

  const postStatus = async () => {
    const cleanText = statusText.trim();
    const cleanLink = normalizeStatusLink(statusLink);
    if (!cleanText && !cleanLink && !statusMediaUrl) {
      setInfo('Add text, photo, video, or link first.');
      return;
    }
    if (!token) return;
    const res = await api<{ status: LocalStatus }>('/statuses', {
      method: 'POST',
      token,
      body: JSON.stringify({
        text: cleanText,
        mediaUrl: statusMediaUrl ?? '',
        mediaType: statusMediaType,
        linkUrl: cleanLink || '',
      }),
    });
    setStatuses((prev) => [res.status, ...prev.filter((status) => status.userId !== res.status.userId)]);
    setActiveStatusId(res.status.id);
    resetStatusComposer();
    setInfo('Status updated');
  };

  const viewStatus = (statusId: string) => {
    setViewedStatusIds((prev) => (prev.includes(statusId) ? prev : [statusId, ...prev]));
    setActiveStatusId(statusId);
    const status = liveStatuses.find((entry) => entry.id === statusId);
    if (status) setInfo(`Seen ${status.name}'s status`);
  };

  const deleteMyStatus = async () => {
    if (!myStatus) return;
    if (!token) return;
    await api(`/statuses/${myStatus.id}`, {
      method: 'DELETE',
      token,
    });
    setStatuses((prev) => prev.filter((status) => status.id !== myStatus.id));
    if (activeStatusId === myStatus.id) setActiveStatusId(null);
    setInfo('Your status was deleted');
  };

  const openStatusLink = (status: LocalStatus) => {
    if (!status.linkUrl) return;
    window.open(status.linkUrl, '_blank', 'noopener,noreferrer');
  };

  const formatStatusTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatStatusListTime = (iso: string) => {
    const current = new Date();
    const stamp = new Date(iso);
    const isSameDay =
      current.getFullYear() === stamp.getFullYear()
      && current.getMonth() === stamp.getMonth()
      && current.getDate() === stamp.getDate();

    return isSameDay
      ? `Today at ${stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : stamp.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  const renderStatusPreview = (status: LocalStatus) => (
    <>
      {status.text ? <span className="statusPreviewText">{status.text}</span> : null}
      {status.mediaUrl ? (
        <div className="statusMediaPreview">
          {status.mediaType === 'video' ? (
            <video src={status.mediaUrl} className="statusPreviewThumb" muted playsInline preload="metadata" />
          ) : (
            <img src={status.mediaUrl} alt={`${status.name} status`} className="statusPreviewThumb" />
          )}
          <span className="statusAttachmentLabel">{status.mediaType === 'video' ? 'Video status' : 'Photo status'}</span>
        </div>
      ) : null}
      {status.linkUrl ? (
        <a className="statusLinkPreview" href={status.linkUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
          {status.linkUrl}
        </a>
      ) : null}
    </>
  );

  const addContact = async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await api<{ contact: (typeof contacts)[number] }>('/contacts', {
        method: 'POST',
        token,
        body: JSON.stringify(contactForm),
      });
      setContacts((prev) => [res.contact, ...prev]);
      setInfo('Contact added');
      setContactForm({ name: '', phoneNumber: '', email: '', avatarUrl: '' });
      setLookupResult(null);
      setMobileContactsView('people');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const lookupByPhone = async () => {
    if (!token || busy || !contactForm.phoneNumber.trim()) return;
    setBusy(true);
    try {
      const res = await api<LookupResult>(`/connections/lookup?phoneNumber=${encodeURIComponent(contactForm.phoneNumber.trim())}`, { token });
      setLookupResult(res);
      if (!res.user) {
        setInfo('No registered user found for this number. You can still save it as a regular contact.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sendConnectionRequest = async () => {
    if (!token || busy || !lookupResult?.user) return;
    setBusy(true);
    try {
      await api('/connections/request', {
        method: 'POST',
        token,
        body: JSON.stringify({
          targetUserId: lookupResult.user.id,
          aliasName: contactForm.name,
          phoneNumber: contactForm.phoneNumber,
        }),
      });
      setLookupResult((prev) => prev ? { ...prev, existingRequest: { id: 'sent', status: 'pending', direction: 'outgoing' } } : prev);
      setInfo(`Connect request sent to ${lookupResult.user.name}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (!token || busy) return;
    setBusy(true);
    try {
      await respondToIncomingRequest(requestId, action);
      if (action === 'accept') setMobileContactsView('people');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const markContactSafety = (contact: (typeof contacts)[number], disposition: 'blocked' | 'reported') => {
    if (disposition === 'reported') {
      setReportTarget({
        requestId: `contact-${contact.id}`,
        userId: contact.registeredUser?.id ?? contact.id,
        name: contact.name,
        avatarUrl: contact.avatarUrl ?? null,
        aliasName: contact.email ?? null,
        phoneNumber: contact.phoneNumber ?? null,
      });
      return;
    }
    saveConnectionRecordFromUser({
      requestId: `contact-${contact.id}`,
      userId: contact.registeredUser?.id ?? contact.id,
      name: contact.name,
      avatarUrl: contact.avatarUrl ?? null,
      aliasName: contact.email ?? null,
      phoneNumber: contact.phoneNumber ?? null,
    }, disposition, disposition === 'blocked' ? 'Blocked from contacts list' : 'Reported from contacts list');
    setInfo(`${contact.name} ${disposition === 'blocked' ? 'blocked' : 'reported'}. Check Settings > Connections for the saved record.`);
  };

  const submitReportReason = async (reason: (typeof reportReasons)[number]) => {
    if (!reportTarget) return;
    try {
      if (token && contacts.some((contact) => contact.registeredUser?.id === reportTarget.userId)) {
        await api('/reports', {
          method: 'POST',
          token,
          body: JSON.stringify({
            targetUserId: reportTarget.userId,
            reason,
            detail: 'Reported from contacts list',
          }),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    saveConnectionRecordFromUser({
      requestId: reportTarget.requestId,
      userId: reportTarget.userId,
      name: reportTarget.name,
      avatarUrl: reportTarget.avatarUrl,
      aliasName: reportTarget.aliasName ?? null,
      phoneNumber: reportTarget.phoneNumber ?? null,
    }, 'reported', reason);
    setInfo(`${reportTarget.name} reported for ${reason.toLowerCase()}.`);
    setReportTarget(null);
  };

  const findPeople = async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await api<{ users: DiscoverUser[] }>(`/users/discover?q=${encodeURIComponent(discoverQuery)}`, { token });
      setDiscoverUsers(res.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startDm = async (userId: string) => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await api<{ chatId: string }>('/chats/dm', {
        method: 'POST',
        token,
        body: JSON.stringify({ userId }),
      });
      const chatRes = await api<{ chats: any[] }>('/chats', { token });
      setChats(chatRes.chats);
      setActiveChatId(res.chatId);
      setInfo('Chat opened. Go to Chats tab.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importDeviceContacts = async () => {
    if (!token || busy) return;
    if (!contactPickerSupported) {
      setInfo('Device contact import works only in supported mobile browsers.');
      return;
    }

    setBusy(true);
    try {
      const picker = (navigator as Navigator & {
        contacts: { select: (properties: string[], options?: { multiple?: boolean }) => Promise<ContactPickerContact[]> };
      }).contacts;
      const selected = await picker.select(['name', 'tel', 'email'], { multiple: true });
      const payload = selected
        .map((entry) => ({
          name: entry.name?.[0]?.trim() ?? '',
          phoneNumber: entry.tel?.[0]?.trim() ?? '',
          email: entry.email?.[0]?.trim() ?? '',
          avatarUrl: '',
        }))
        .filter((entry) => entry.name || entry.phoneNumber || entry.email);

      if (!payload.length) {
        setInfo('No contacts were selected.');
        return;
      }

      const res = await api<{ contacts: Array<(typeof contacts)[number]> }>('/contacts/import', {
        method: 'POST',
        token,
        body: JSON.stringify({ contacts: payload }),
      });
      setContacts((prev) => {
        const existingIds = new Set(prev.map((contact) => contact.id));
        const next = [...prev];
        for (const contact of res.contacts) {
          if (!existingIds.has(contact.id)) next.unshift(contact);
        }
        return next;
      });
      setInfo(`Imported ${res.contacts.length} contact${res.contacts.length === 1 ? '' : 's'}.`);
      setMobileContactsView('people');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (section !== 'contacts' && section !== 'updates') return null;

  if (section === 'updates') {
    if (isMobile) {
      return (
        <section className="screenPane mobileUpdatesScreen">
          <div className="mobilePageHeader">
            <h2>Updates</h2>
            <div className="mobilePageHeaderActions">
              <button type="button" className="mobileHeaderIconButton" aria-label="Search updates">
                <span className="mobileHeaderGlyph mobileHeaderGlyph-search" />
              </button>
              <button type="button" className="mobileHeaderIconButton" aria-label="Open updates menu">
                <span className="mobileHeaderGlyph mobileHeaderGlyph-more" />
              </button>
            </div>
          </div>

          <div className="mobileSectionLabel">Status</div>
          <button type="button" className="mobileStatusOwnerCard" onClick={() => (myStatus ? setActiveStatusId(myStatus.id) : postStatus())}>
            <div className="rowStart">
              <div className="statusAvatarRing myStatusRing">
                <Avatar name={me?.name || 'My status'} avatarUrl={myStatus?.avatarUrl ?? me?.avatarUrl ?? null} />
              </div>
              <div className="cardText">
                <strong>Add status</strong>
                <span>{myStatus ? 'Tap to view your latest update' : 'Disappears after 24 hours'}</span>
              </div>
            </div>
          </button>

          <div className="mobileStatusList">
            {recentStatuses.length ? recentStatuses.map((status) => (
              <button key={status.id} type="button" className="mobileStatusRow" onClick={() => viewStatus(status.id)}>
                <div className="rowStart">
                  <div className="statusAvatarRing freshStatusRing">
                    <Avatar name={status.name} avatarUrl={status.avatarUrl} />
                  </div>
                  <div className="cardText">
                    <strong>{status.name}</strong>
                    <span>{new Date(status.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </button>
            )) : <div className="compactEmpty requestEmptyCard">No updates yet.</div>}
            {viewedStatuses.length ? <div className="mobileSectionSubLabel">Viewed updates</div> : null}
            {viewedStatuses.map((status) => (
              <button key={status.id} type="button" className="mobileStatusRow mobileStatusRow-viewed" onClick={() => viewStatus(status.id)}>
                <div className="rowStart">
                  <div className="statusAvatarRing viewedStatusRing">
                    <Avatar name={status.name} avatarUrl={status.avatarUrl} />
                  </div>
                  <div className="cardText">
                    <strong>{status.name}</strong>
                    <span>{new Date(status.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button type="button" className="mobileMiniFab mobileMiniFab-edit" onClick={() => setStatusText((current) => current)}>
            +
          </button>
          <button type="button" className="mobileFab" onClick={postStatus}>
            +
          </button>
        </section>
      );
    }

    return (
      <section className="screenPane updatesScreen">
        <div className="statusDesktopLayout">
          <aside className="statusSidebar">
            <div className="statusSidebarHeader">
              <div className="statusSidebarTitleBlock">
                <h2>Status</h2>
              </div>
              <div className="statusSidebarActions">
                <button className="ghostIconButton statusAddButton" type="button" onClick={postStatus} aria-label="Post status">
                  <span className="statusAddGlyph" aria-hidden="true">+</span>
                </button>
                <button className="ghostIconButton statusMoreButton" type="button" aria-label="More status options">
                  <span className="statusMoreGlyph" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
            </div>

            <div className="statusSidebarScroll">
              <div className="statusComposerCard statusComposerRailCard">
                <button type="button" className="statusRow statusOwnerRow statusPanelRow" onClick={() => (myStatus ? setActiveStatusId(myStatus.id) : postStatus())}>
                  <div className="rowStart">
                    <div className="statusOwnerAvatarShell">
                      <div className="statusAvatarRing myStatusRing">
                        <Avatar name={me?.name || 'My status'} avatarUrl={myStatus?.avatarUrl ?? me?.avatarUrl ?? null} />
                      </div>
                      <span className="statusOwnerBadge" aria-hidden="true">+</span>
                    </div>
                    <div className="cardText">
                      <strong>My status</strong>
                      <span>{myStatus ? 'Tap to view your latest status' : 'Click to add status update'}</span>
                    </div>
                  </div>
                </button>
                <div className="composerInputRow statusComposerInputRow">
                  <input
                    className="input"
                    placeholder="Write a text status"
                    value={statusText}
                    onChange={(event) => setStatusText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') postStatus();
                    }}
                  />
                  <button className="primaryBtn statusShareButton" onClick={postStatus}>
                    Share
                  </button>
                </div>
                <div className="statusAttachmentControls">
                  <label className="statusAttachButton">
                    <input type="file" accept="image/*,video/*" onChange={(event) => void readStatusMedia(event)} />
                    Add photo or video
                  </label>
                  <input
                    className="input"
                    placeholder="Paste a link"
                    value={statusLink}
                    onChange={(event) => setStatusLink(event.target.value)}
                  />
                </div>
                {statusMediaUrl || statusLink.trim() ? (
                  <div className="statusDraftPreview">
                    {statusMediaUrl ? (
                      statusMediaType === 'video' ? (
                        <video src={statusMediaUrl} className="statusDraftMedia" controls muted playsInline />
                      ) : (
                        <img src={statusMediaUrl} alt="Status draft" className="statusDraftMedia" />
                      )
                    ) : null}
                    {statusLink.trim() ? <span className="statusLinkDraft">{normalizeStatusLink(statusLink)}</span> : null}
                  </div>
                ) : null}
              </div>

              <div className="statusGroup">
                <p className="statusGroupLabel">Recent</p>
                <div className="statusList">
                  {recentStatuses.length ? recentStatuses.map((status) => (
                    <button key={status.id} type="button" className="statusRow contactRow tappableRow statusPanelRow" onClick={() => viewStatus(status.id)}>
                      <div className="rowStart">
                        <div className="statusAvatarRing freshStatusRing">
                          <Avatar name={status.name} avatarUrl={status.avatarUrl} />
                        </div>
                        <div className="cardText">
                          <strong>{status.name}</strong>
                          <span>{formatStatusListTime(status.createdAt)}</span>
                          {renderStatusPreview(status)}
                        </div>
                      </div>
                    </button>
                  )) : <div className="compactEmpty">No new status updates right now.</div>}
                </div>
              </div>

              <div className="statusGroup">
                <p className="statusGroupLabel">Viewed</p>
                <div className="statusList">
                  {viewedStatuses.length ? viewedStatuses.map((status) => (
                    <button key={status.id} type="button" className="statusRow contactRow tappableRow statusPanelRow" onClick={() => viewStatus(status.id)}>
                      <div className="rowStart">
                        <div className="statusAvatarRing viewedStatusRing">
                          <Avatar name={status.name} avatarUrl={status.avatarUrl} />
                        </div>
                        <div className="cardText">
                          <strong>{status.name}</strong>
                          <span>{formatStatusListTime(status.createdAt)}</span>
                          {renderStatusPreview(status)}
                        </div>
                      </div>
                    </button>
                  )) : <div className="compactEmpty">Viewed statuses will appear here.</div>}
                </div>
              </div>
            </div>
          </aside>

          <div className="statusStage">
            {activeStatus ? (
              <div className="statusViewerCard">
                <div className="statusViewerHeader">
                  <div className="rowStart">
                    <div className={activeStatus.mine ? 'statusAvatarRing myStatusRing' : viewedStatusIds.includes(activeStatus.id) ? 'statusAvatarRing viewedStatusRing' : 'statusAvatarRing freshStatusRing'}>
                      <Avatar name={activeStatus.name} avatarUrl={activeStatus.avatarUrl} />
                    </div>
                    <div className="cardText">
                      <strong>{activeStatus.mine ? 'My status' : activeStatus.name}</strong>
                      <span>{formatStatusTime(activeStatus.createdAt)}</span>
                    </div>
                  </div>
                  <div className="contactActions">
                    {activeStatus.linkUrl ? (
                      <button type="button" className="ghostBtn smallGhost" onClick={() => openStatusLink(activeStatus)}>
                        Open link
                      </button>
                    ) : null}
                    {activeStatus.mine ? (
                      <button type="button" className="ghostBtn smallGhost" onClick={deleteMyStatus}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="statusViewerBody">
                  {activeStatus.mediaUrl ? (
                    activeStatus.mediaType === 'video' ? (
                      <video src={activeStatus.mediaUrl} className="statusViewerMedia" controls autoPlay playsInline />
                    ) : (
                      <img src={activeStatus.mediaUrl} alt={`${activeStatus.name} status`} className="statusViewerMedia" />
                    )
                  ) : (
                    <div className="statusViewerTextCard">
                      <div className="statusStageGlyph">O</div>
                      <h3>{activeStatus.text || 'Status update'}</h3>
                      <p>{activeStatus.linkUrl ? activeStatus.linkUrl : 'Share photos, videos and text that disappear after 24 hours.'}</p>
                    </div>
                  )}
                  {activeStatus.text ? <div className="statusViewerCaption">{activeStatus.text}</div> : null}
                </div>
                <div className="statusStageFooter">Your status updates are end-to-end encrypted</div>
              </div>
            ) : (
              <>
                <div className="statusStageCenter">
                  <div className="statusStageGlyph">O</div>
                  <h3>Share status updates</h3>
                  <p>Share photos, videos and text that disappear after 24 hours.</p>
                </div>
                <div className="statusStageFooter">Your status updates are end-to-end encrypted</div>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="stackLayout">
      <div className="mobileSectionNav">
        <button className={mobileContactsView === 'people' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setMobileContactsView('people')}>
          People
        </button>
        <button className={showingStatusScreen ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setMobileContactsView('status')}>
          Status
        </button>
        <button className={mobileContactsView === 'add' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setMobileContactsView('add')}>
          Add
        </button>
        <button className={mobileContactsView === 'discover' ? 'ghostBtn activeTab' : 'ghostBtn'} onClick={() => setMobileContactsView('discover')}>
          Discover
        </button>
      </div>

      {mobileContactsView === 'people' ? (
        <section className="sheetCard">
          <div className="sectionTop">
            <h2>People ({visibleContacts.length})</h2>
          </div>
          <div className="miniHero">
            <div>
              <strong>{visibleContacts.length}</strong>
              <span>saved contacts</span>
            </div>
            <div>
              <strong>{registeredContacts.length}</strong>
              <span>connected</span>
            </div>
            <div>
              <strong>{incomingRequests.length}</strong>
              <span>requests</span>
            </div>
          </div>
          {!!incomingRequests.length && (
            <div className="requestStack">
              {incomingRequests.map((request) => (
                <div key={request.id} className="requestCard">
                  <div className="rowStart">
                    <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                    <div className="cardText">
                      <strong>{request.fromUser.name || request.fromUser.username || 'Unknown user'}</strong>
                      <span>{request.phoneNumber || request.aliasName || `@${request.fromUser.username}` || 'Wants to connect with you'}</span>
                    </div>
                  </div>
                  <div className="contactActions">
                    <button className="ghostBtn smallGhost" onClick={() => void respondToRequest(request.id, 'reject')} disabled={busy}>
                      Reject
                    </button>
                    <button className="primaryBtn smallGhost" onClick={() => void respondToRequest(request.id, 'accept')} disabled={busy}>
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="contactList">
            {visibleContacts.map((contact) => (
              <div key={contact.id} className="requestCard contactActionCard">
                <button
                  className={contact.registeredUser ? 'contactRow tappableRow' : 'contactRow'}
                  onClick={contact.registeredUser ? () => void startDm(contact.registeredUser!.id) : undefined}
                  disabled={!contact.registeredUser}
                  type="button"
                >
                  <div className="rowStart">
                    <Avatar name={contact.name} avatarUrl={contact.avatarUrl} />
                    <div className="cardText">
                      <strong>{contact.name}</strong>
                      <span>{contact.email || contact.phoneNumber || 'No details'}</span>
                      {contact.registeredUser ? <span className="tapHint">Tap to open chat</span> : null}
                    </div>
                  </div>
                  {contact.registeredUser ? (
                    <span className="rowActionLabel">Open</span>
                  ) : (
                    <span className="miniText">Not on HelloToo</span>
                  )}
                </button>
                <div className="contactActions">
                  <button type="button" className="ghostBtn smallGhost" onClick={() => markContactSafety(contact, 'blocked')}>
                    Block
                  </button>
                  <button type="button" className="ghostBtn smallGhost" onClick={() => markContactSafety(contact, 'reported')}>
                    Report
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {mobileContactsView === 'status' ? (
        <section className="sheetCard statusSheet">
          <div className="sectionTop">
            <h2>Status</h2>
          </div>
          <div className="statusComposerCard">
            <button type="button" className="statusRow statusOwnerRow" onClick={() => (myStatus ? setActiveStatusId(myStatus.id) : postStatus())}>
              <div className="rowStart">
                <div className="statusAvatarRing myStatusRing">
                  <Avatar name={me?.name || 'My status'} avatarUrl={myStatus?.avatarUrl ?? me?.avatarUrl ?? null} />
                </div>
                <div className="cardText">
                  <strong>My status</strong>
                  <span>{myStatus ? 'Tap to view your latest status' : 'Click to add status update'}</span>
                </div>
              </div>
              <span className="rowActionLabel">Post</span>
            </button>
            <div className="composerInputRow">
              <input
                className="input"
                placeholder="Write a text status"
                value={statusText}
                onChange={(event) => setStatusText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') postStatus();
                }}
              />
              <button className="primaryBtn" onClick={postStatus}>
                Share
              </button>
            </div>
            <div className="statusAttachmentControls">
              <label className="statusAttachButton">
                <input type="file" accept="image/*,video/*" onChange={(event) => void readStatusMedia(event)} />
                Add photo or video
              </label>
              <input
                className="input"
                placeholder="Paste a link"
                value={statusLink}
                onChange={(event) => setStatusLink(event.target.value)}
              />
            </div>
            {statusMediaUrl || statusLink.trim() ? (
              <div className="statusDraftPreview">
                {statusMediaUrl ? (
                  statusMediaType === 'video' ? (
                    <video src={statusMediaUrl} className="statusDraftMedia" controls muted playsInline />
                  ) : (
                    <img src={statusMediaUrl} alt="Status draft" className="statusDraftMedia" />
                  )
                ) : null}
                {statusLink.trim() ? <span className="statusLinkDraft">{normalizeStatusLink(statusLink)}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="statusGroup">
            <p className="statusGroupLabel">Recent</p>
            <div className="contactList">
              {recentStatuses.length ? recentStatuses.map((status) => (
                <button key={status.id} type="button" className="statusRow contactRow tappableRow" onClick={() => viewStatus(status.id)}>
                  <div className="rowStart">
                    <div className="statusAvatarRing freshStatusRing">
                      <Avatar name={status.name} avatarUrl={status.avatarUrl} />
                    </div>
                    <div className="cardText">
                      <strong>{status.name}</strong>
                      <span>{new Date(status.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {renderStatusPreview(status)}
                    </div>
                  </div>
                  <span className="rowActionLabel">Seen</span>
                </button>
              )) : <div className="compactEmpty">No new status updates right now.</div>}
            </div>
          </div>

          <div className="statusGroup">
            <p className="statusGroupLabel">Viewed</p>
            <div className="contactList">
              {viewedStatuses.length ? viewedStatuses.map((status) => (
                <button key={status.id} type="button" className="statusRow contactRow tappableRow" onClick={() => viewStatus(status.id)}>
                  <div className="rowStart">
                    <div className="statusAvatarRing viewedStatusRing">
                      <Avatar name={status.name} avatarUrl={status.avatarUrl} />
                    </div>
                    <div className="cardText">
                      <strong>{status.name}</strong>
                      <span>{new Date(status.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {renderStatusPreview(status)}
                    </div>
                  </div>
                </button>
              )) : <div className="compactEmpty">Viewed statuses will appear here.</div>}
            </div>
          </div>

          {activeStatus ? (
            <div className="statusMobileViewer">
              <div className="statusViewerHeader">
                <div className="rowStart">
                  <div className={activeStatus.mine ? 'statusAvatarRing myStatusRing' : viewedStatusIds.includes(activeStatus.id) ? 'statusAvatarRing viewedStatusRing' : 'statusAvatarRing freshStatusRing'}>
                    <Avatar name={activeStatus.name} avatarUrl={activeStatus.avatarUrl} />
                  </div>
                  <div className="cardText">
                    <strong>{activeStatus.mine ? 'My status' : activeStatus.name}</strong>
                    <span>{formatStatusTime(activeStatus.createdAt)}</span>
                  </div>
                </div>
                {activeStatus.mine ? (
                  <button type="button" className="ghostBtn smallGhost" onClick={deleteMyStatus}>
                    Delete
                  </button>
                ) : null}
              </div>
              <div className="statusViewerBody">
                {activeStatus.mediaUrl ? (
                  activeStatus.mediaType === 'video' ? (
                    <video src={activeStatus.mediaUrl} className="statusViewerMedia" controls autoPlay playsInline />
                  ) : (
                    <img src={activeStatus.mediaUrl} alt={`${activeStatus.name} status`} className="statusViewerMedia" />
                  )
                ) : (
                  <div className="statusViewerTextCard">
                    <div className="statusStageGlyph">O</div>
                    <h3>{activeStatus.text || 'Status update'}</h3>
                    <p>{activeStatus.linkUrl ? activeStatus.linkUrl : 'Share photos, videos and text that disappear after 24 hours.'}</p>
                  </div>
                )}
                {activeStatus.text ? <div className="statusViewerCaption">{activeStatus.text}</div> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {mobileContactsView === 'add' ? (
        <section className="sheetCard">
          <div className="sectionTop">
            <h2>Add Contact</h2>
          </div>
          <div className="contactImportCard">
            <div className="cardText">
              <strong>Import from device</strong>
              <span>Pick contacts from your phone browser when supported.</span>
            </div>
            <button className="ghostBtn" onClick={() => void importDeviceContacts()} disabled={busy}>
              Import
            </button>
          </div>
          <div className="formGrid twoCol">
            <label className="field">
              <span>Name</span>
              <input className="input" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input className="input" value={contactForm.phoneNumber} onChange={(e) => setContactForm({ ...contactForm, phoneNumber: e.target.value })} />
            </label>
            <label className="field spanTwo">
              <span>Email</span>
              <input className="input" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
            </label>
          </div>
          <div className="contactActions">
            <button className="ghostBtn" onClick={() => void lookupByPhone()} disabled={busy || !contactForm.phoneNumber.trim()}>
              Check number
            </button>
            <button className="primaryBtn" onClick={() => void addContact()} disabled={busy}>
              {busy ? 'Working...' : 'Save only'}
            </button>
          </div>
          {lookupResult?.user ? (
            <div className="requestCard">
              <div className="rowStart">
                <Avatar name={lookupResult.user.name} avatarUrl={lookupResult.user.avatarUrl} />
                <div className="cardText">
                  <strong>{lookupResult.user.name}</strong>
                  <span>{lookupResult.user.statusText || `@${lookupResult.user.username}`}</span>
                </div>
              </div>
              <div className="cardText">
                {lookupResult.existingContact ? (
                  <span>Already connected on HelloToo.</span>
                ) : lookupResult.existingRequest ? (
                  <span>{lookupResult.existingRequest.direction === 'outgoing' ? 'Connect request already sent.' : 'This user already wants to connect with you.'}</span>
                ) : (
                  <button className="primaryBtn" onClick={() => void sendConnectionRequest()} disabled={busy}>
                    Send connect request
                  </button>
                )}
              </div>
            </div>
          ) : lookupResult ? (
            <div className="compactEmpty">No server user found for this number yet.</div>
          ) : null}
          <p className="miniText">Enter a phone number. If that number exists on this server, you can send a connect request before chatting.</p>
        </section>
      ) : null}

      {mobileContactsView === 'discover' ? (
        <section className="sheetCard">
          <div className="sectionTop">
            <h2>Discover People</h2>
          </div>
          <div className="composerInputRow">
            <input
              className="input"
              placeholder="Search by name, phone, email"
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void findPeople();
              }}
            />
            <button className="ghostBtn" onClick={() => void findPeople()} disabled={busy}>
              Find
            </button>
          </div>
          <div className="contactList">
            {discoverUsers.map((user) => (
              <button key={user.id} className="contactRow tappableRow" onClick={() => void startDm(user.id)} type="button">
                <div className="rowStart">
                  <Avatar name={user.name} avatarUrl={user.avatarUrl} />
                  <div className="cardText">
                    <strong>{user.name}</strong>
                    <span>@{user.username}</span>
                    <span className="tapHint">Tap to start chat</span>
                  </div>
                </div>
                <span className="rowActionLabel">Chat</span>
              </button>
            ))}
            {!discoverUsers.length ? <div className="compactEmpty">No results yet. Search by name, phone, or email.</div> : null}
          </div>
        </section>
      ) : null}
      {reportTarget ? (
        <div className="modalScrim" onClick={() => setReportTarget(null)}>
          <div className="connectModalCard profileDetailCard" onClick={(event) => event.stopPropagation()}>
            <div className="sectionTop">
              <h2>Report {reportTarget.name}</h2>
              <button className="ghostBtn smallGhost" onClick={() => setReportTarget(null)}>
                Close
              </button>
            </div>
            <p className="miniText">Choose the type of report you want to make.</p>
            <div className="requestStack">
              {reportReasons.map((reason) => (
                <button key={reason} type="button" className="requestCard chatMatchCard" onClick={() => void submitReportReason(reason)}>
                  <div className="cardText">
                    <strong>{reason}</strong>
                    <span>{reason === 'Spam messages' ? 'Repeated spam or promotional messages.' : reason === 'Fraud or scam' ? 'Fraud, money scam, cheating or fake payment attempt.' : reason === 'Abusive behaviour' ? 'Harassment, threats or abusive behaviour.' : reason === 'Unwanted messages' ? 'Messages you do not want from this contact.' : 'Fake identity or misleading profile details.'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
