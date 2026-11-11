import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB6DrG1-z3Sqs0uqJuEnEiFmjO4dXSsGS8",
  authDomain: "korean-bowl-attendance.firebaseapp.com",
  projectId: "korean-bowl-attendance",
  storageBucket: "korean-bowl-attendance.firebasestorage.app",
  messagingSenderId: "23835796186",
  appId: "1:23835796186:web:927d0401dfcec45384fbe3",
  measurementId: "G-VTRW6VDQ8N"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BRANCHES = {
  "French Village": { lat: 12.9654, lng: 80.1856, radius: 300, shift: "3:30 PM - 1:30 AM" }, 
  "Capital Land (Taramani)": { lat: 12.9832, lng: 80.2450, radius: 300, shift: "10:30 AM - 10:30 PM" }
};

const STAFF_DIRECTORY = {
  "Capital Land (Taramani)": ["Keerthika", "Rosanglian", "Lalruat Fela", "Clinton"],
  "French Village": ["Chandaran", "Pousianlung Gonmei", "Dimthaolung Gonmei", "Sougrakpam Gandhi Singh"]
};

export default function AttendanceApp() {
  const [selectedBranch, setSelectedBranch] = useState('French Village');
  const [empId, setEmpId] = useState(STAFF_DIRECTORY['French Village'][0]);
  const [attendanceType, setAttendanceType] = useState('CHECK_IN');
  const [locationStatus, setLocationStatus] = useState('');
  const [isLocationVerified, setIsLocationVerified] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState('form'); 
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const [adminBranchFilter, setAdminBranchFilter] = useState('French Village');
  const [logs, setLogs] = useState([]);
  
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  const [modalImage, setModalImage] = useState(null);
  const [commentInputs, setCommentInputs] = useState({});

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Fetch logs from Firebase Firestore on load and view mode change
  useEffect(() => {
    fetchLogsFromFirebase();
  }, [isAdminAuthenticated]);

  const fetchLogsFromFirebase = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "attendance_logs"));
      const firebaseLogs = [];
      querySnapshot.forEach((docSnap) => {
        firebaseLogs.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort newest first
      firebaseLogs.sort((a, b) => (b.id - a.id));
      setLogs(firebaseLogs);
    } catch (error) {
      console.error("Error fetching logs: ", error);
    }
  };

  const handleBranchChange = (branch) => {
    setSelectedBranch(branch);
    setEmpId(STAFF_DIRECTORY[branch][0]);
  };

  const verifyLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation not supported');
      return;
    }

    setLocationStatus('Checking GPS location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const targetBranch = BRANCHES[selectedBranch];
        const distance = getDistanceFromLatLonInMeters(userLat, userLng, targetBranch.lat, targetBranch.lng);

        if (distance <= targetBranch.radius) {
          setLocationStatus(`Verified! Within range (${Math.round(distance)}m).`);
          setIsLocationVerified(true);
          startCamera();
        } else {
          setLocationStatus(`Failed! Too far from shop (${Math.round(distance)}m away).`);
          setIsLocationVerified(false);
        }
      },
      () => { setLocationStatus('Unable to retrieve location.'); },
      { enableHighAccuracy: true }
    );
  };

  function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  function deg2rad(deg) { return deg * (Math.PI / 180); }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { alert("Camera access denied."); }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setCapturedImage(canvas.toDataURL('image/png'));
      if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const handleSubmit = async () => {
    if (!capturedImage) { alert("Take a verification selfie"); return; }

    setLoading(true);
    try {
      const now = new Date();
      const currentDateStr = now.toISOString().slice(0, 10);
      const currentTimeStr = now.toLocaleTimeString();
      const logId = Date.now();

      if (attendanceType === 'CHECK_IN') {
        const newLogData = {
          id: logId,
          empId,
          branch: selectedBranch,
          checkInTime: currentTimeStr,
          checkOutTime: '-',
          dateStr: currentDateStr,
          checkInImage: capturedImage,
          checkOutImage: '',
          remarks: 'On Time',
          comment: '',
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, "attendance_logs"), newLogData);
      } else {
        // Find existing today log for this employee to update check-out
        const existingLog = logs.find(l => l.empId === empId && l.dateStr === currentDateStr && l.checkOutTime === '-');
        if (existingLog) {
          const docRef = doc(db, "attendance_logs", existingLog.id.toString());
          await updateDoc(docRef, {
            checkOutTime: currentTimeStr,
            checkOutImage: capturedImage
          });
        } else {
          const newLogData = {
            id: logId,
            empId,
            branch: selectedBranch,
            checkInTime: '-',
            checkOutTime: currentTimeStr,
            dateStr: currentDateStr,
            checkInImage: '',
            checkOutImage: capturedImage,
            remarks: 'Check-Out Only',
            comment: '',
            createdAt: serverTimestamp()
          };
          await addDoc(collection(db, "attendance_logs"), newLogData);
        }
      }

      alert(`${attendanceType === 'CHECK_IN' ? 'Check-In' : 'Check-Out'} recorded successfully to Firebase for ${empId}!`);
      setCapturedImage(null);
      setIsLocationVerified(false);
      setLocationStatus('');
      fetchLogsFromFirebase();
    } catch (e) {
      console.error("Error writing document: ", e);
      alert("Error saving attendance to Firebase.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'Ghanshyamsuresh26') {
      setIsAdminAuthenticated(true);
      setViewMode('dashboard');
      setAdminPassword('');
    } else {
      alert("Incorrect Admin Password!");
    }
  };

  const updateLogReason = async (docFirebaseId, logId, newReason) => {
    try {
      const docRef = doc(db, "attendance_logs", docFirebaseId);
      await updateDoc(docRef, { remarks: newReason });
      setLogs(logs.map(l => l.id === logId ? { ...l, remarks: newReason } : l));
    } catch (err) {
      console.error("Error updating reason:", err);
    }
  };

  const saveLogComment = async (docFirebaseId, logId) => {
    const commentText = commentInputs[logId] || '';
    try {
      const docRef = doc(db, "attendance_logs", docFirebaseId);
      await updateDoc(docRef, { comment: commentText });
      setLogs(logs.map(l => l.id === logId ? { ...l, comment: commentText } : l));
      alert("Comment saved successfully!");
    } catch (err) {
      console.error("Error saving comment:", err);
    }
  };

  const deleteLogEntry = async (docFirebaseId, logId) => {
    if (window.confirm("Are you sure you want to delete this attendance entry?")) {
      try {
        await deleteDoc(doc(db, "attendance_logs", docFirebaseId));
        setLogs(logs.filter(l => l.id !== logId));
      } catch (err) {
        console.error("Error deleting entry:", err);
      }
    }
  };

  const applyDateFilter = () => {
    if (!exportStartDate || !exportEndDate) {
      alert("Please select both From and To dates.");
      return;
    }
    setAppliedStartDate(exportStartDate);
    setAppliedEndDate(exportEndDate);
  };

  const exportToCSV = () => {
    let filteredLogs = logs.filter(l => l.branch === adminBranchFilter);
    if (appliedStartDate && appliedEndDate) {
      filteredLogs = filteredLogs.filter(l => l.dateStr >= appliedStartDate && l.dateStr <= appliedEndDate);
    }

    if (filteredLogs.length === 0) {
      alert("No logs found for the selected date range.");
      return;
    }

    const headers = ["Employee Name,Branch,Date,Check-In Time,Check-Out Time,Status,Comment\n"];
    const rows = filteredLogs.map(l => `"${l.empId}","${l.branch}","${l.dateStr}","${l.checkInTime}","${l.checkOutTime}","${l.remarks}","${l.comment || ''}"\n`);
    
    const blob = new Blob([...headers, ...rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Attendance_${adminBranchFilter}_${appliedStartDate || 'All'}_to_${appliedEndDate || 'All'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  let displayedLogs = logs.filter(l => l.branch === adminBranchFilter);
  if (appliedStartDate && appliedEndDate) {
    displayedLogs = displayedLogs.filter(l => l.dateStr >= appliedStartDate && l.dateStr <= appliedEndDate);
  }

  return (
    <div style={{ padding: '20px', maxWidth: '780px', margin: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ textAlign: 'center', color: '#904b3d' }}>Korean Bowl Attendance (Live Firebase)</h2>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '10px' }}>
        <button 
          onClick={() => setViewMode('form')} 
          style={{ padding: '8px 15px', backgroundColor: viewMode === 'form' ? '#904b3d' : '#ccc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Staff Portal
        </button>
        <button 
          onClick={() => viewMode === 'dashboard' ? setViewMode('dashboard') : setViewMode('admin_login')} 
          style={{ padding: '8px 15px', backgroundColor: (viewMode === 'dashboard' || viewMode === 'admin_login') ? '#904b3d' : '#ccc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Admin Dashboard
        </button>
      </div>

      {viewMode === 'form' && (
        <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <div style={{ marginBottom: '15px' }}>
            <label><b>Select Branch:</b></label>
            <select value={selectedBranch} onChange={(e) => handleBranchChange(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
              <option value="French Village">French Village ({BRANCHES["French Village"].shift})</option>
              <option value="Capital Land (Taramani)">Capital Land - Taramani ({BRANCHES["Capital Land (Taramani)"].shift})</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label><b>Select Employee Name:</b></label>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
              {STAFF_DIRECTORY[selectedBranch].map((name, idx) => (
                <option key={idx} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label><b>Action Type:</b></label>
            <select value={attendanceType} onChange={(e) => setAttendanceType(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '5px' }}>
              <option value="CHECK_IN">Check-In (Login)</option>
              <option value="CHECK_OUT">Check-Out (Logout)</option>
            </select>
          </div>

          <button onClick={verifyLocation} style={{ width: '100%', padding: '12px', backgroundColor: '#904b3d', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
            1. Verify GPS Location
          </button>

          <p style={{ fontSize: '14px', color: '#333', marginTop: '10px', textAlign: 'center' }}>{locationStatus}</p>

          {isLocationVerified && !capturedImage && (
            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <p><b>Take Verification Selfie:</b></p>
              <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '8px', background: '#000' }}></video>
              <button onClick={capturePhoto} style={{ marginTop: '10px', width: '100%', padding: '10px', background: '#333', color: '#fff', border: 'none', borderRadius: '5px' }}>Capture Photo</button>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

          {capturedImage && (
            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <img src={capturedImage} alt="selfie" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #904b3d' }} />
              <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', marginTop: '15px', padding: '12px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
                {loading ? "Submitting..." : `Submit ${attendanceType === 'CHECK_IN' ? 'Check-In' : 'Check-Out'}`}
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === 'admin_login' && !isAdminAuthenticated && (
        <div style={{ background: '#f4f4f4', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
          <h3>Admin Protected Area</h3>
          <p style={{ fontSize: '13px', color: '#666' }}>Please enter admin password</p>
          <input 
            type="password" 
            placeholder="Admin Password" 
            value={adminPassword} 
            onChange={(e) => setAdminPassword(e.target.value)} 
            style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} 
          />
          <button onClick={handleAdminLogin} style={{ width: '100%', padding: '10px', backgroundColor: '#904b3d', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            Login to Dashboard
          </button>
        </div>
      )}

      {viewMode === 'dashboard' && isAdminAuthenticated && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Management Dashboard</h3>
            <button onClick={() => { setIsAdminAuthenticated(false); setViewMode('form'); fetchLogsFromFirebase(); }} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px' }}>Logout</button>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button 
              onClick={() => setAdminBranchFilter('French Village')} 
              style={{ flex: 1, padding: '10px', background: adminBranchFilter === 'French Village' ? '#904b3d' : '#ddd', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              French Village (3:30 PM - 1:30 AM)
            </button>
            <button 
              onClick={() => setAdminBranchFilter('Capital Land (Taramani)')} 
              style={{ flex: 1, padding: '10px', background: adminBranchFilter === 'Capital Land (Taramani)' ? '#904b3d' : '#ddd', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Capital Land - Taramani (10:30 AM - 10:30 PM)
            </button>
          </div>

          <div style={{ background: '#f9f9f9', padding: '12px', borderRadius: '6px', marginBottom: '15px', border: '1px solid #ddd' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Filter & Export Reports</h4>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '12px' }}>From: </label>
                <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} style={{ padding: '5px' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px' }}>To: </label>
                <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} style={{ padding: '5px' }} />
              </div>
              <button onClick={applyDateFilter} style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                Apply Filter
              </button>
              {(appliedStartDate || appliedEndDate) && (
                <button onClick={() => { setAppliedStartDate(''); setAppliedEndDate(''); setExportStartDate(''); setExportEndDate(''); }} style={{ padding: '6px 10px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  Clear Filter
                </button>
              )}
            </div>
            <button onClick={exportToCSV} style={{ padding: '8px 15px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
              Download Excel Report
            </button>
          </div>

          <h4>Attendance Records for {adminBranchFilter} {appliedStartDate ? `(${appliedStartDate} to ${appliedEndDate})` : ''}</h4>
          {displayedLogs.length === 0 ? <p style={{ fontSize: '13px', color: '#666' }}>No attendance records found for this selection.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#904b3d', color: '#fff', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Staff Name</th>
                    <th style={{ padding: '8px' }}>Selfies</th>
                    <th style={{ padding: '8px' }}>Date</th>
                    <th style={{ padding: '8px' }}>Login</th>
                    <th style={{ padding: '8px' }}>Logout</th>
                    <th style={{ padding: '8px' }}>Status / Reason & Comments</th>
                    <th style={{ padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{log.empId}</td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {log.checkInImage && (
                            <img src={log.checkInImage} alt="In" onClick={() => setModalImage(log.checkInImage)} title="Login Selfie" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer', border: '1px solid green' }} />
                          )}
                          {log.checkOutImage && (
                            <img src={log.checkOutImage} alt="Out" onClick={() => setModalImage(log.checkOutImage)} title="Logout Selfie" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer', border: '1px solid red' }} />
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px' }}>{log.dateStr}</td>
                      <td style={{ padding: '8px', color: 'green' }}>{log.checkInTime}</td>
                      <td style={{ padding: '8px', color: 'red' }}>{log.checkOutTime}</td>
                      <td style={{ padding: '8px' }}>
                        <div><b>Status: {log.remarks}</b></div>
                        <div style={{ marginTop: '5px', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                          <button onClick={() => updateLogReason(log.id, log.id, 'On Time')} style={{ fontSize: '10px', padding: '2px 4px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '3px' }}>On Time</button>
                          <button onClick={() => updateLogReason(log.id, log.id, 'Late')} style={{ fontSize: '10px', padding: '2px 4px', background: '#fd7e14', color: '#fff', border: 'none', borderRadius: '3px' }}>Late</button>
                          <button onClick={() => updateLogReason(log.id, log.id, 'Permission')} style={{ fontSize: '10px', padding: '2px 4px', background: '#17a2b8', color: '#fff', border: 'none', borderRadius: '3px' }}>Permission</button>
                          <button onClick={() => updateLogReason(log.id, log.id, 'Sick Leave')} style={{ fontSize: '10px', padding: '2px 4px', background: '#ffc107', color: '#000', border: 'none', borderRadius: '3px' }}>Sick Leave</button>
                          <button onClick={() => updateLogReason(log.id, log.id, 'Unplanned Leave')} style={{ fontSize: '10px', padding: '2px 4px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '3px' }}>Unplanned</button>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="Add reason/comments..." 
                            defaultValue={log.comment || ''} 
                            onChange={(e) => setCommentInputs({ ...commentInputs, [log.id]: e.target.value })}
                            style={{ width: '130px', fontSize: '11px', padding: '3px' }}
                          />
                          <button onClick={() => saveLogComment(log.id, log.id)} style={{ fontSize: '10px', padding: '3px 5px', background: '#333', color: '#fff', border: 'none', marginLeft: '4px', cursor: 'pointer' }}>Save</button>
                          {log.comment && <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Note: {log.comment}</div>}
                        </div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <button onClick={() => deleteLogEntry(log.id, log.id)} style={{ padding: '5px 8px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalImage && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <h4>Verification Selfie</h4>
            <img src={modalImage} alt="Full Selfie" style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px', marginBottom: '10px' }} />
            <div>
              <button onClick={() => setModalImage(null)} style={{ padding: '6px 15px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}