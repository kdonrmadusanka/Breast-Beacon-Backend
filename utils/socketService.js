const EventTypes = {
  // Case Events
  CASE_CREATED: 'case-created',
  CASE_UPDATED: 'case-updated',
  CASE_STATUS_CHANGED: 'case-status-changed',
  CASE_ASSIGNED: 'case-assigned',
  CASE_COMPLETED: 'case-completed',

  // Report Events
  REPORT_CREATED: 'report-created',
  REPORT_UPDATED: 'report-updated',
  REPORT_FINALIZED: 'report-finalized',
  REPORT_DELETED: 'report-deleted',

  // User Events
  USER_CREATED: 'user-created',
  USER_UPDATED: 'user-updated',
  USER_DELETED: 'user-deleted',
  USER_LOGGED_IN: 'user-logged-in',
  USER_LOGGED_OUT: 'user-logged-out',

  // Admin Events
  SYSTEM_ALERT: 'system-alert',
  MAINTENANCE_MODE: 'maintenance-mode',
  USER_ACTIVITY: 'user-activity',

  // Annotation Events
  ANNOTATION_ADDED: 'annotation-added',
  ANNOTATION_UPDATED: 'annotation-updated',
  ANNOTATION_DELETED: 'annotation-deleted',

  // Template Events
  TEMPLATE_CREATED: 'template-created',
  TEMPLATE_UPDATED: 'template-updated',
  TEMPLATE_DELETED: 'template-deleted',

  // Dashboard Events
  DASHBOARD_UPDATED: 'dashboard-updated',
  STATISTICS_UPDATED: 'statistics-updated',
};

class SocketService {
  constructor(io) {
    this.io = io;
  }

  // Global emit method
  emitToAll(eventType, data) {
    this.io.emit(eventType, {
      type: eventType,
      data: data,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit to specific user
  emitToUser(userId, eventType, data) {
    this.io.to(`user-${userId}`).emit(eventType, {
      type: eventType,
      data: data,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit to specific room (cases, departments, etc.)
  emitToRoom(roomId, eventType, data) {
    this.io.to(roomId).emit(eventType, {
      type: eventType,
      data: data,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit to multiple users
  emitToUsers(userIds, eventType, data) {
    userIds.forEach((userId) => {
      this.emitToUser(userId, eventType, data);
    });
  }

  // Emit to all except sender
  emitToOthers(socketId, eventType, data) {
    this.io.except(socketId).emit(eventType, {
      type: eventType,
      data: data,
      timestamp: new Date().toISOString(),
    });
  }

  // Case-specific methods
  emitCaseCreated(caseData) {
    this.emitToAll(EventTypes.CASE_CREATED, caseData);
  }

  emitCaseUpdated(caseData) {
    this.emitToAll(EventTypes.CASE_UPDATED, caseData);
  }

  emitCaseAssigned(caseData, radiologistId) {
    this.emitToUser(radiologistId, EventTypes.CASE_ASSIGNED, caseData);
    this.emitToOthers('admin-room', EventTypes.CASE_ASSIGNED, caseData);
  }

  emitCaseCompleted(caseData) {
    this.emitToAll(EventTypes.CASE_COMPLETED, caseData);
  }

  // User-specific methods
  emitUserCreated(userData) {
    this.emitToRoom('admin-room', EventTypes.USER_CREATED, userData);
  }

  emitUserUpdated(userData) {
    this.emitToUser(userData._id, EventTypes.USER_UPDATED, userData);
    this.emitToRoom('admin-room', EventTypes.USER_UPDATED, userData);
  }

  emitUserActivity(userId, activity) {
    this.emitToRoom('admin-room', EventTypes.USER_ACTIVITY, {
      userId,
      activity,
      timestamp: new Date(),
    });
  }

  // Report-specific methods
  emitReportCreated(reportData) {
    this.emitToRoom(
      `case-${reportData.caseId}`,
      EventTypes.REPORT_CREATED,
      reportData,
    );
  }

  emitReportFinalized(reportData) {
    this.emitToAll(EventTypes.REPORT_FINALIZED, reportData);
  }

  // Admin-specific methods
  emitSystemAlert(alertData) {
    this.emitToAll(EventTypes.SYSTEM_ALERT, alertData);
  }

  emitMaintenanceMode(status) {
    this.emitToAll(EventTypes.MAINTENANCE_MODE, { maintenance: status });
  }

  // Dashboard methods
  emitDashboardUpdate(stats) {
    this.emitToRoom('dashboard-room', EventTypes.DASHBOARD_UPDATED, stats);
  }

  // Get connected users count (useful for admin)
  getConnectedUsersCount() {
    return this.io.engine.clientsCount;
  }

  // Get all connected sockets (for admin monitoring)
  getAllConnectedSockets() {
    return this.io.sockets.sockets;
  }
}

module.exports = { SocketService, EventTypes };
