/** Transport boundary only. Each server handler authenticates and authorizes independently. */
export interface CommandGateway {
  execute<Request, Response>(name: string, input: Request): Promise<Response>;
}
