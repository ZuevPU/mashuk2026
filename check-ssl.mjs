import https from 'https';

const req = https.request({
  hostname: 'zuevpu-mashuk2026-1535.twc1.net',
  port: 443,
  method: 'GET',
}, (res) => {
  const cert = res.socket.getPeerCertificate(true);
  console.log('Certificate subject:', cert.subject);
  console.log('Issuer:', cert.issuer);
  
  let currentCert = cert;
  let chainLength = 1;
  while (currentCert.issuerCertificate && currentCert.fingerprint !== currentCert.issuerCertificate.fingerprint) {
    currentCert = currentCert.issuerCertificate;
    chainLength++;
    console.log(`Chain ${chainLength} Issuer:`, currentCert.issuer);
  }
  console.log('Total chain length:', chainLength);
});

req.on('error', (e) => {
  console.error(e);
});
req.end();
