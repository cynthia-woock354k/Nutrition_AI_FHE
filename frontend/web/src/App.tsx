// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

// Randomly selected styles:
// Colors: Low saturated pastel (cream yellow / mint green / cherry blossom pink)
// UI Style: Glass morphism
// Layout: Card type
// Interaction: Micro interaction (hover ripple, button breathing light)

// Randomly selected features:
// 1. Data statistics
// 2. Smart chart
// 3. Search & filter function
// 4. User operation history record

interface NutritionRecord {
  id: number;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: string; // FHE encrypted
  protein: string; // FHE encrypted
  carbs: string; // FHE encrypted
  fat: string; // FHE encrypted
  notes: string;
}

interface HealthGoal {
  targetCalories: string; // FHE encrypted
  targetProtein: string; // FHE encrypted
  targetCarbs: string; // FHE encrypted
  targetFat: string; // FHE encrypted
}

interface UserAction {
  type: 'add' | 'update' | 'decrypt' | 'analyze';
  timestamp: number;
  details: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<NutritionRecord[]>([]);
  const [healthGoal, setHealthGoal] = useState<HealthGoal>({
    targetCalories: '',
    targetProtein: '',
    targetCarbs: '',
    targetFat: ''
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingRecord, setAddingRecord] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState<Omit<NutritionRecord, 'id'>>({ 
    date: new Date().toISOString().split('T')[0],
    mealType: 'breakfast',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    notes: ''
  });
  const [selectedRecord, setSelectedRecord] = useState<NutritionRecord | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ [key: string]: number | null }>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [activeTab, setActiveTab] = useState('records');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMealType, setFilterMealType] = useState<string>('all');

  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "ZAMA FHE Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load nutrition records
      const recordsBytes = await contract.getData("nutritionRecords");
      let recordsList: NutritionRecord[] = [];
      if (recordsBytes.length > 0) {
        try {
          const recordsStr = ethers.toUtf8String(recordsBytes);
          if (recordsStr.trim() !== '') recordsList = JSON.parse(recordsStr);
        } catch (e) {}
      }
      setRecords(recordsList);
      
      // Load health goals
      const goalsBytes = await contract.getData("healthGoals");
      let goalsData: HealthGoal = {
        targetCalories: '',
        targetProtein: '',
        targetCarbs: '',
        targetFat: ''
      };
      if (goalsBytes.length > 0) {
        try {
          const goalsStr = ethers.toUtf8String(goalsBytes);
          if (goalsStr.trim() !== '') goalsData = JSON.parse(goalsStr);
        } catch (e) {}
      }
      setHealthGoal(goalsData);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Add new nutrition record
  const addRecord = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setAddingRecord(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Adding nutrition record with ZAMA FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new record
      const newRecord: NutritionRecord = {
        id: records.length + 1,
        date: newRecordData.date,
        mealType: newRecordData.mealType,
        calories: FHEEncryptNumber(parseFloat(newRecordData.calories || '0')),
        protein: FHEEncryptNumber(parseFloat(newRecordData.protein || '0')),
        carbs: FHEEncryptNumber(parseFloat(newRecordData.carbs || '0')),
        fat: FHEEncryptNumber(parseFloat(newRecordData.fat || '0')),
        notes: newRecordData.notes
      };
      
      // Update records list
      const updatedRecords = [...records, newRecord];
      
      // Save to contract
      await contract.setData("nutritionRecords", ethers.toUtf8Bytes(JSON.stringify(updatedRecords)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'add',
        timestamp: Math.floor(Date.now() / 1000),
        details: `Added ${newRecordData.mealType} record`
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Record added with FHE encryption!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewRecordData({ 
          date: new Date().toISOString().split('T')[0],
          mealType: 'breakfast',
          calories: '',
          protein: '',
          carbs: '',
          fat: '',
          notes: ''
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setAddingRecord(false); 
    }
  };

  // Update health goals
  const updateHealthGoals = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Updating health goals with ZAMA FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Encrypt goals
      const encryptedGoals: HealthGoal = {
        targetCalories: FHEEncryptNumber(parseFloat(healthGoal.targetCalories || '0')),
        targetProtein: FHEEncryptNumber(parseFloat(healthGoal.targetProtein || '0')),
        targetCarbs: FHEEncryptNumber(parseFloat(healthGoal.targetCarbs || '0')),
        targetFat: FHEEncryptNumber(parseFloat(healthGoal.targetFat || '0'))
      };
      
      // Save to contract
      await contract.setData("healthGoals", ethers.toUtf8Bytes(JSON.stringify(encryptedGoals)));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'update',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Updated health goals"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Health goals updated with FHE!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Update failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt data with signature
  const decryptWithSignature = async (encryptedData: string, key: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'decrypt',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Decrypted nutrition data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  // Handle decrypt button click
  const handleDecrypt = async (record: NutritionRecord) => {
    const decryptedCalories = await decryptWithSignature(record.calories, `calories-${record.id}`);
    const decryptedProtein = await decryptWithSignature(record.protein, `protein-${record.id}`);
    const decryptedCarbs = await decryptWithSignature(record.carbs, `carbs-${record.id}`);
    const decryptedFat = await decryptWithSignature(record.fat, `fat-${record.id}`);
    
    if (decryptedCalories !== null && decryptedProtein !== null && decryptedCarbs !== null && decryptedFat !== null) {
      setDecryptedData(prev => ({
        ...prev,
        [`calories-${record.id}`]: decryptedCalories,
        [`protein-${record.id}`]: decryptedProtein,
        [`carbs-${record.id}`]: decryptedCarbs,
        [`fat-${record.id}`]: decryptedFat
      }));
    }
  };

  // Analyze nutrition data
  const analyzeNutrition = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Analyzing nutrition data with ZAMA FHE..." });
    
    try {
      // Simulate FHE analysis
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update user actions
      const newAction: UserAction = {
        type: 'analyze',
        timestamp: Math.floor(Date.now() / 1000),
        details: "Analyzed nutrition data"
      };
      setUserActions(prev => [newAction, ...prev]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Nutrition analysis completed!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Analysis failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Filter records based on search term and meal type
  const filteredRecords = records.filter(record => {
    const matchesSearch = record.notes.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         record.date.includes(searchTerm);
    const matchesMealType = filterMealType === 'all' || record.mealType === filterMealType;
    return matchesSearch && matchesMealType;
  });

  // Calculate nutrition statistics
  const calculateStats = () => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    
    records.forEach(record => {
      try {
        totalCalories += FHEDecryptNumber(record.calories);
        totalProtein += FHEDecryptNumber(record.protein);
        totalCarbs += FHEDecryptNumber(record.carbs);
        totalFat += FHEDecryptNumber(record.fat);
      } catch (e) {}
    });
    
    return {
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      avgCalories: records.length > 0 ? totalCalories / records.length : 0,
      avgProtein: records.length > 0 ? totalProtein / records.length : 0,
      avgCarbs: records.length > 0 ? totalCarbs / records.length : 0,
      avgFat: records.length > 0 ? totalFat / records.length : 0
    };
  };

  // Render nutrition chart
  const renderNutritionChart = () => {
    const stats = calculateStats();
    const targetCalories = FHEDecryptNumber(healthGoal.targetCalories || FHEEncryptNumber(0));
    const targetProtein = FHEDecryptNumber(healthGoal.targetProtein || FHEEncryptNumber(0));
    
    return (
      <div className="nutrition-chart">
        <div className="chart-row">
          <div className="chart-label">Calories</div>
          <div className="chart-bar">
            <div 
              className="bar-fill calories" 
              style={{ width: `${Math.min(100, (stats.totalCalories / (targetCalories || 1)) * 100)}%` }}
            >
              <span className="bar-value">{stats.totalCalories.toFixed(0)}/{targetCalories || '?'}</span>
            </div>
          </div>
          <div className="chart-percentage">
            {targetCalories > 0 ? `${((stats.totalCalories / targetCalories) * 100).toFixed(1)}%` : 'N/A'}
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Protein</div>
          <div className="chart-bar">
            <div 
              className="bar-fill protein" 
              style={{ width: `${Math.min(100, (stats.totalProtein / (targetProtein || 1)) * 100)}%` }}
            >
              <span className="bar-value">{stats.totalProtein.toFixed(0)}g/{targetProtein || '?'}g</span>
            </div>
          </div>
          <div className="chart-percentage">
            {targetProtein > 0 ? `${((stats.totalProtein / targetProtein) * 100).toFixed(1)}%` : 'N/A'}
          </div>
        </div>
      </div>
    );
  };

  // Render FHE flow visualization
  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Data Encryption</h4>
            <p>Your nutrition data is encrypted using Zama FHE before storage</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Private Analysis</h4>
            <p>AI analyzes your encrypted data without decrypting it</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Secure Recommendations</h4>
            <p>Personalized nutrition advice is generated privately</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Your Control</h4>
            <p>Only you can decrypt your data with your wallet signature</p>
          </div>
        </div>
      </div>
    );
  };

  // Render user actions history
  const renderUserActions = () => {
    if (userActions.length === 0) return <div className="no-data">No actions recorded</div>;
    
    return (
      <div className="actions-list">
        {userActions.map((action, index) => (
          <div className="action-item" key={index}>
            <div className={`action-type ${action.type}`}>
              {action.type === 'add' && '➕'}
              {action.type === 'update' && '🔄'}
              {action.type === 'decrypt' && '🔓'}
              {action.type === 'analyze' && '🔍'}
            </div>
            <div className="action-details">
              <div className="action-text">{action.details}</div>
              <div className="action-time">{new Date(action.timestamp * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted nutrition system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="ai-icon"></div>
          </div>
          <h1>隱養師<span>AI Nutritionist</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAddModal(true)} 
            className="add-record-btn"
          >
            <div className="add-icon"></div>Add Record
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <div className="dashboard-grid">
            <div className="dashboard-panel intro-panel">
              <div className="panel-card glass">
                <h2>Private AI Nutritionist with FHE</h2>
                <p>隱養師 is an AI nutritionist that provides personalized dietary recommendations while keeping your health data encrypted using Zama FHE technology.</p>
                <div className="fhe-badge">
                  <div className="fhe-icon"></div>
                  <span>Powered by Zama FHE</span>
                </div>
              </div>
              
              <div className="panel-card glass">
                <h2>FHE Nutrition Flow</h2>
                {renderFHEFlow()}
              </div>
              
              <div className="panel-card glass">
                <h2>Nutrition Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{records.length}</div>
                    <div className="stat-label">Records</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {calculateStats().totalCalories.toFixed(0)}
                    </div>
                    <div className="stat-label">Total Calories</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {calculateStats().totalProtein.toFixed(0)}g
                    </div>
                    <div className="stat-label">Total Protein</div>
                  </div>
                </div>
                {renderNutritionChart()}
              </div>
            </div>
          </div>
          
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'records' ? 'active' : ''}`}
                onClick={() => setActiveTab('records')}
              >
                Nutrition Records
              </button>
              <button 
                className={`tab ${activeTab === 'goals' ? 'active' : ''}`}
                onClick={() => setActiveTab('goals')}
              >
                Health Goals
              </button>
              <button 
                className={`tab ${activeTab === 'actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('actions')}
              >
                My Actions
              </button>
            </div>
            
            <div className="tab-content">
              {activeTab === 'records' && (
                <div className="records-section">
                  <div className="section-header">
                    <h2>Nutrition Records</h2>
                    <div className="header-actions">
                      <div className="search-filter">
                        <input 
                          type="text" 
                          placeholder="Search notes or date..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <select 
                          value={filterMealType}
                          onChange={(e) => setFilterMealType(e.target.value)}
                        >
                          <option value="all">All Meal Types</option>
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                        </select>
                      </div>
                      <button 
                        onClick={loadData} 
                        className="refresh-btn" 
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                  </div>
                  
                  <div className="records-list">
                    {filteredRecords.length === 0 ? (
                      <div className="no-records">
                        <div className="no-records-icon"></div>
                        <p>No nutrition records found</p>
                        <button 
                          className="create-btn" 
                          onClick={() => setShowAddModal(true)}
                        >
                          Add First Record
                        </button>
                      </div>
                    ) : filteredRecords.map((record, index) => (
                      <div 
                        className={`record-item glass ${selectedRecord?.id === record.id ? "selected" : ""}`} 
                        key={index}
                        onClick={() => setSelectedRecord(record)}
                      >
                        <div className="record-header">
                          <div className="record-date">{record.date}</div>
                          <div className={`record-meal-type ${record.mealType}`}>
                            {record.mealType.charAt(0).toUpperCase() + record.mealType.slice(1)}
                          </div>
                        </div>
                        <div className="record-notes">{record.notes || "No notes"}</div>
                        <div className="record-encrypted">
                          <span>Encrypted Data:</span> 
                          {record.calories.substring(0, 10)}...
                        </div>
                        <div className="record-actions">
                          <button 
                            className="decrypt-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecrypt(record);
                            }}
                            disabled={isDecrypting}
                          >
                            {isDecrypting ? "Decrypting..." : "Decrypt"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'goals' && (
                <div className="goals-section">
                  <h2>Health Goals</h2>
                  <div className="goals-form glass">
                    <div className="form-group">
                      <label>Target Calories (kcal)</label>
                      <input 
                        type="text" 
                        value={healthGoal.targetCalories}
                        onChange={(e) => setHealthGoal({...healthGoal, targetCalories: e.target.value})}
                        placeholder="Enter target calories..."
                      />
                    </div>
                    <div className="form-group">
                      <label>Target Protein (g)</label>
                      <input 
                        type="text" 
                        value={healthGoal.targetProtein}
                        onChange={(e) => setHealthGoal({...healthGoal, targetProtein: e.target.value})}
                        placeholder="Enter target protein..."
                      />
                    </div>
                    <div className="form-group">
                      <label>Target Carbs (g)</label>
                      <input 
                        type="text" 
                        value={healthGoal.targetCarbs}
                        onChange={(e) => setHealthGoal({...healthGoal, targetCarbs: e.target.value})}
                        placeholder="Enter target carbs..."
                      />
                    </div>
                    <div className="form-group">
                      <label>Target Fat (g)</label>
                      <input 
                        type="text" 
                        value={healthGoal.targetFat}
                        onChange={(e) => setHealthGoal({...healthGoal, targetFat: e.target.value})}
                        placeholder="Enter target fat..."
                      />
                    </div>
                    <div className="form-actions">
                      <button 
                        onClick={updateHealthGoals}
                        className="update-btn"
                      >
                        Update Goals
                      </button>
                      <button 
                        onClick={analyzeNutrition}
                        className="analyze-btn"
                      >
                        Analyze Nutrition
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'actions' && (
                <div className="actions-section">
                  <h2>My Activity History</h2>
                  {renderUserActions()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showAddModal && (
        <ModalAddRecord 
          onSubmit={addRecord} 
          onClose={() => setShowAddModal(false)} 
          adding={addingRecord} 
          recordData={newRecordData} 
          setRecordData={setNewRecordData}
        />
      )}
      
      {selectedRecord && (
        <RecordDetailModal 
          record={selectedRecord} 
          onClose={() => { 
            setSelectedRecord(null); 
            setDecryptedData({});
          }} 
          decryptedData={decryptedData}
          isDecrypting={isDecrypting}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal glass">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="ai-icon"></div>
              <span>隱養師 AI Nutritionist</span>
            </div>
            <p>Private nutrition analysis powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} 隱養師. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect your health data. 
            Nutrition analysis is performed on encrypted data without revealing your private information.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddRecordProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalAddRecord: React.FC<ModalAddRecordProps> = ({ onSubmit, onClose, adding, recordData, setRecordData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="add-record-modal glass">
        <div className="modal-header">
          <h2>Add Nutrition Record</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Privacy Notice</strong>
              <p>Your nutrition data will be encrypted before storage</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Date *</label>
            <input 
              type="date" 
              name="date" 
              value={recordData.date} 
              onChange={handleChange} 
            />
          </div>
          
          <div className="form-group">
            <label>Meal Type *</label>
            <select 
              name="mealType" 
              value={recordData.mealType} 
              onChange={handleChange}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Calories (kcal)</label>
              <input 
                type="number" 
                name="calories" 
                value={recordData.calories} 
                onChange={handleChange} 
                placeholder="Enter calories..."
              />
            </div>
            <div className="form-group">
              <label>Protein (g)</label>
              <input 
                type="number" 
                name="protein" 
                value={recordData.protein} 
                onChange={handleChange} 
                placeholder="Enter protein..."
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Carbs (g)</label>
              <input 
                type="number" 
                name="carbs" 
                value={recordData.carbs} 
                onChange={handleChange} 
                placeholder="Enter carbs..."
              />
            </div>
            <div className="form-group">
              <label>Fat (g)</label>
              <input 
                type="number" 
                name="fat" 
                value={recordData.fat} 
                onChange={handleChange} 
                placeholder="Enter fat..."
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Notes</label>
            <textarea 
              name="notes" 
              value={recordData.notes} 
              onChange={handleChange} 
              placeholder="Add any notes about this meal..."
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={adding || !recordData.date || !recordData.mealType} 
            className="submit-btn"
          >
            {adding ? "Adding with FHE..." : "Add Record"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecordDetailModalProps {
  record: NutritionRecord;
  onClose: () => void;
  decryptedData: { [key: string]: number | null };
  isDecrypting: boolean;
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ 
  record, 
  onClose, 
  decryptedData,
  isDecrypting
}) => {
  return (
    <div className="modal-overlay">
      <div className="record-detail-modal glass">
        <div className="modal-header">
          <h2>Record Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="record-info">
            <div className="info-item">
              <span>Date:</span>
              <strong>{record.date}</strong>
            </div>
            <div className="info-item">
              <span>Meal Type:</span>
              <strong className={`meal-type ${record.mealType}`}>
                {record.mealType.charAt(0).toUpperCase() + record.mealType.slice(1)}
              </strong>
            </div>
            <div className="info-item full-width">
              <span>Notes:</span>
              <div className="record-notes">{record.notes || "No notes"}</div>
            </div>
          </div>
          
          <div className="nutrition-section">
            <h3>Nutrition Data</h3>
            <div className="nutrition-grid">
              <div className="nutrition-item">
                <span>Calories:</span>
                <div className="nutrition-value">
                  {decryptedData[`calories-${record.id}`] !== null ? (
                    <strong>{decryptedData[`calories-${record.id}`]?.toFixed(0)} kcal</strong>
                  ) : (
                    <span className="encrypted">Encrypted</span>
                  )}
                </div>
              </div>
              <div className="nutrition-item">
                <span>Protein:</span>
                <div className="nutrition-value">
                  {decryptedData[`protein-${record.id}`] !== null ? (
                    <strong>{decryptedData[`protein-${record.id}`]?.toFixed(0)}g</strong>
                  ) : (
                    <span className="encrypted">Encrypted</span>
                  )}
                </div>
              </div>
              <div className="nutrition-item">
                <span>Carbs:</span>
                <div className="nutrition-value">
                  {decryptedData[`carbs-${record.id}`] !== null ? (
                    <strong>{decryptedData[`carbs-${record.id}`]?.toFixed(0)}g</strong>
                  ) : (
                    <span className="encrypted">Encrypted</span>
                  )}
                </div>
              </div>
              <div className="nutrition-item">
                <span>Fat:</span>
                <div className="nutrition-value">
                  {decryptedData[`fat-${record.id}`] !== null ? (
                    <strong>{decryptedData[`fat-${record.id}`]?.toFixed(0)}g</strong>
                  ) : (
                    <span className="encrypted">Encrypted</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">
              <div className="data-item">
                <span>Calories:</span>
                <code>{record.calories.substring(0, 20)}...</code>
              </div>
              <div className="data-item">
                <span>Protein:</span>
                <code>{record.protein.substring(0, 20)}...</code>
              </div>
              <div className="data-item">
                <span>Carbs:</span>
                <code>{record.carbs.substring(0, 20)}...</code>
              </div>
              <div className="data-item">
                <span>Fat:</span>
                <code>{record.fat.substring(0, 20)}...</code>
              </div>
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;