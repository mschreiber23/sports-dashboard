import { useState, useEffect } from 'react';

export default function InstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show on iOS Safari when NOT already installed as standalone
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const dismissed = localStorage.getItem('install_banner_dismissed');
    if (isIOS && !isStandalone && !dismissed) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem('install_banner_dismissed', '1');
    setShow(false);
  };

  return (
    <div className="install-banner">
      <div className="install-banner-content">
        <span className="install-icon">📲</span>
        <div>
          <div className="install-title">Add to Home Screen</div>
          <div className="install-sub">
            Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to save your teams permanently
          </div>
        </div>
      </div>
      <button className="install-dismiss" onClick={dismiss}>✕</button>
    </div>
  );
}
