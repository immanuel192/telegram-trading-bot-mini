print('MongoDB started, initializing replica set...');

// Wait for MongoDB to be fully started
sleep(2000);

// Always use localhost for replica set member
// MongoDB can always connect to itself via localhost
// External clients will connect via Docker service name 'mongo' with directConnection=true
const actualHostname = 'localhost';
print('Using localhost for replica set member - MongoDB can connect to itself');

try {
  // Check if replica set is already initialized
  let rsStatus;
  try {
    rsStatus = rs.status();
    print('Replica set already exists:', rsStatus.set);
  } catch (initError) {
    print('Replica set not initialized, creating new one...');

    // Initialize replica set with localhost
    const replicaSetConfig = {
      _id: 'rs0',
      members: [
        {
          _id: 0,
          host: actualHostname + ':27017',
          priority: 1
        },
      ],
    };

    print('Initializing replica set with config:', JSON.stringify(replicaSetConfig));
    rs.initiate(replicaSetConfig);
    print('Replica set initialized successfully');
  }
} catch (error) {
  print('Error initializing replica set:', error);
  // Don't throw error here to allow retry or manual intervention
  // But failing init usually means something is wrong
}

// Wait for Primary
print('Waiting for replica set to be ready...');
let attempts = 0;
const maxAttempts = 30; 

while (attempts < maxAttempts) {
  try {
    const status = rs.isMaster();
    if (status.ismaster) {
      print('MongoDB replica set is ready: PRIMARY');
      break;
    }
    print('Waiting for primary... attempt', attempts + 1);
    sleep(1000);
    attempts++;
  } catch (statusError) {
    print('Error checking replica set status:', statusError);
    sleep(1000);
    attempts++;
  }
}
