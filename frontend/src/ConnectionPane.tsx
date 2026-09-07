import { Avatar } from './App';
import { useApp } from './AppContext';

export function ConnectionPane() {
  const {
    incomingRequests,
    respondToIncomingRequest,
    setActiveChatId,
    setInfo,
    setError,
    isMobile,
  } = useApp();

  const openAcceptedChat = async (requestId: string) => {
    try {
      const result = await respondToIncomingRequest(requestId, 'accept');
      if (result && typeof result === 'object' && 'chatId' in result) {
        const chatId = result.chatId;
        if (chatId) {
          setActiveChatId(chatId);
          window.dispatchEvent(new CustomEvent('helloto:open-chat', { detail: { chatId } }));
        }
      }
      setInfo('Connected. Your chat is ready now.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const rejectRequest = async (requestId: string) => {
    try {
      await respondToIncomingRequest(requestId, 'reject');
      setInfo('Connection rejected.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (isMobile) {
    return (
      <section className="screenPane mobileCommunitiesScreen">
        <div className="mobilePageHeader">
          <h2>Communities</h2>
          <div className="mobilePageHeaderActions">
            <button type="button" className="mobileHeaderIconButton" aria-label="Open communities menu">
              <span className="mobileHeaderGlyph mobileHeaderGlyph-more" />
            </button>
          </div>
        </div>

        <div className="mobileCommunityHeroCard">
          <div className="mobileCommunityIcon">+</div>
          <div className="cardText">
            <strong>New community</strong>
            <span>Create or organize your HelloToo groups here.</span>
          </div>
        </div>

        <div className="mobileCommunitySectionLabel">Your communities</div>
        <div className="mobileCommunityList">
          {incomingRequests.length ? incomingRequests.map((request) => (
            <div key={request.id} className="mobileCommunityCard">
              <div className="rowStart">
                <div className="mobileCommunityAvatarWrap">
                  <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} size={52} />
                </div>
                <div className="cardText">
                  <strong>{request.fromUser.name || request.fromUser.username || 'Unknown user'}</strong>
                  <span>{request.phoneNumber || request.aliasName || `@${request.fromUser.username}` || 'Sent you a connection request'}</span>
                  <span>{new Date(request.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                </div>
              </div>
              <div className="contactActions">
                <button type="button" className="ghostBtn smallGhost" onClick={() => void rejectRequest(request.id)}>
                  Reject
                </button>
                <button type="button" className="primaryBtn smallGhost" onClick={() => void openAcceptedChat(request.id)}>
                  Accept
                </button>
              </div>
            </div>
          )) : (
            <div className="compactEmpty requestEmptyCard">No communities or connection requests yet.</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="screenPane commandCenter">
      <div className="sectionTop">
        <h2>Connections</h2>
      </div>
      <div className="miniHero">
        <div>
          <strong>{incomingRequests.length}</strong>
          <span>pending requests</span>
        </div>
        <div>
          <strong>{incomingRequests.filter((request) => Boolean(request.phoneNumber)).length}</strong>
          <span>with number</span>
        </div>
        <div>
          <strong>{incomingRequests.filter((request) => Boolean(request.aliasName)).length}</strong>
          <span>with alias</span>
        </div>
      </div>

      {incomingRequests.length ? (
        <div className="requestStack accountRequestList">
          {incomingRequests.map((request) => (
            <div key={request.id} className="requestCard">
              <div className="rowStart">
                <Avatar name={request.fromUser.name} avatarUrl={request.fromUser.avatarUrl} />
                <div className="cardText">
                  <strong>{request.fromUser.name || request.fromUser.username || 'Unknown user'}</strong>
                  <span>{request.phoneNumber || request.aliasName || `@${request.fromUser.username}` || 'Sent you a connection request'}</span>
                  <span>{new Date(request.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div className="contactActions">
                <button type="button" className="ghostBtn smallGhost" onClick={() => void rejectRequest(request.id)}>
                  Reject
                </button>
                <button type="button" className="primaryBtn smallGhost" onClick={() => void openAcceptedChat(request.id)}>
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="compactEmpty requestEmptyCard">No pending connection requests right now.</div>
      )}
    </section>
  );
}
